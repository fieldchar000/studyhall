// nova-keys: Nova's talk keys for Studyhall (Windows).
//  • Hold Ctrl + Alt (left Alt, so AltGr never triggers it) = talk. Prints "ptt-down", then "ptt-up"
//    when you let go, or "ptt-cancel" if another key joins in (a normal Ctrl+Alt+something shortcut).
//  • Hold Ctrl + Alt + Shift = Nova hears the PC's sound too. Prints "hear-down", then "hear-up" when Ctrl or Alt is
//    let go.
//  • Tap Ctrl + Shift on their own = type. Prints "type".
//  • "duck on <names>" on its input: other apps' sound goes quieter (Windows' per-app volume), except apps whose
//    process name is in the comma-separated <names>; "duck off" puts every volume back as it was (also when it exits).
//  • Esc pressed = "esc" (Nova stops talking or drawing, from any app).
//  • Only while Studyhall asks ("clicks on" on its input, until "clicks off"): a left mouse click = "click" (a drawn
//    walkthrough waiting for your click on a step). Studyhall reads where the cursor is itself.
//  • Only while the pen is on ("pen on" … "pen off"): the left button pressed and let go ("lmb-down", "lmb-up": the
//    pen draws while it's held) and the right button pressed ("rmb-down": undo the last mark).
// It only checks those keys a few times a second (GetAsyncKeyState); it never records or prints which other keys you
// press. It exits when Studyhall closes its input.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

static class NovaKeys
{
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);

    const int LSHIFT = 0xA0, RSHIFT = 0xA1, LCTRL = 0xA2, RCTRL = 0xA3, LALT = 0xA4, RALT = 0xA5;

    static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

    /** Is any key pressed other than Ctrl, Alt and Shift (mouse buttons don't count)? */
    static bool OtherKey()
    {
        for (int vk = 0x08; vk <= 0xFE; vk++)
        {
            if (vk >= 0x10 && vk <= 0x12) continue; // generic Shift/Ctrl/Alt
            if (vk >= 0xA0 && vk <= 0xA5) continue; // left/right Shift/Ctrl/Alt
            if (Down(vk)) return true;
        }
        return false;
    }

    static void Say(string s) { lock (Console.Out) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
    static volatile bool clicks = false;
    static volatile bool pen = false; // the pen is on: report the mouse buttons ("lmb-down", "lmb-up", "rmb-down")

    static void Main()
    {
        // Quit when Studyhall goes away (its end of our input closes).
        new Thread(() =>
        {
            try
            {
                string line;
                while ((line = Console.In.ReadLine()) != null)
                {
                    if (line.Trim() == "clicks on") clicks = true;
                    else if (line.Trim() == "clicks off") clicks = false;
                    else if (line.Trim() == "pen on") pen = true;
                    else if (line.Trim() == "pen off") pen = false;
                    else if (line.Trim().StartsWith("duck on")) Duck.On(line.Trim().Substring(7));
                    else if (line.Trim() == "duck off") Duck.Off();
                }
            }
            catch { }
            Duck.Off();
            Environment.Exit(0);
        }) { IsBackground = true }.Start();
        bool escWas = false, clickWas = false, lmbWas = false, rmbWas = false;

        const int TICK = 25, HOLD_MS = 250, TAP_MS = 600;
        int talkHeld = 0;      // ms Ctrl+Alt has been held on their own
        bool talking = false;  // "ptt-down" sent
        bool spoiled = false;  // another key joined: wait until everything is released
        int typeHeld = -1;     // ms Ctrl+Shift held on their own (-1 = not in a tap)
        bool typeSpoiled = false;
        int hearHeld = 0;      // ms Ctrl+Alt+Shift held
        bool hearing = false;  // "hear-down" sent

        while (true)
        {
            Thread.Sleep(TICK);
            bool ctrl = Down(LCTRL) || Down(RCTRL);
            bool lalt = Down(LALT);
            bool altgr = Down(RALT);
            bool shift = Down(LSHIFT) || Down(RSHIFT);
            bool other = (ctrl || lalt || shift) && OtherKey();

            // ----- Esc, and left clicks while asked -----
            bool esc = Down(0x1B);
            if (esc && !escWas) Say("esc");
            escWas = esc;
            bool click = Down(0x01);
            if (clicks && click && !clickWas) Say("click");
            clickWas = click;
            // ----- The pen: it draws while the left button is held; the right button undoes the last mark -----
            if (pen && click != lmbWas) Say(click ? "lmb-down" : "lmb-up");
            lmbWas = click;
            bool rmb = Down(0x02);
            if (pen && rmb && !rmbWas) Say("rmb-down");
            rmbWas = rmb;

            // ----- Hold Ctrl + Alt + Shift: Nova hears the PC's sound too (until Ctrl or Alt is let go) -----
            bool hearCombo = ctrl && lalt && shift && !altgr;
            if (hearing)
            {
                if (!ctrl || !lalt) { Say("hear-up"); hearing = false; hearHeld = 0; }
                if (typeHeld >= 0) typeSpoiled = true; // (Ctrl+Shift then Alt: not a tap to type)
                continue;
            }
            if (!spoiled && hearCombo && !other)
            {
                if (talking) { Say("ptt-cancel"); talking = false; talkHeld = 0; } // (Shift joined a moment late)
                if (typeHeld >= 0) typeSpoiled = true;
                hearHeld += TICK;
                if (hearHeld >= HOLD_MS) { hearing = true; Say("hear-down"); spoiled = true; } // no talk until both are let go
                continue;
            }
            hearHeld = 0;

            // ----- Hold Ctrl + Alt to talk -----
            bool talkCombo = ctrl && lalt && !altgr && !shift;
            if (spoiled)
            {
                if (!ctrl && !lalt) spoiled = false;
            }
            else if (talkCombo && !other)
            {
                talkHeld += TICK;
                if (!talking && talkHeld >= HOLD_MS) { talking = true; Say("ptt-down"); }
            }
            else if (talkCombo && other)
            {
                if (talking) Say("ptt-cancel");
                talking = false; talkHeld = 0; spoiled = true;
            }
            else
            {
                if (talking) Say("ptt-up");
                talking = false; talkHeld = 0;
            }

            // ----- Tap Ctrl + Shift to type -----
            bool typeCombo = ctrl && shift && !lalt && !altgr;
            if (typeCombo)
            {
                if (typeHeld < 0) { typeHeld = 0; typeSpoiled = false; }
                typeHeld += TICK;
                if (other || typeHeld > TAP_MS) typeSpoiled = true;
            }
            else if (typeHeld >= 0)
            {
                // Tap ends when both are released (no other key, short press).
                if (!ctrl && !shift)
                {
                    if (!typeSpoiled) Say("type");
                    typeHeld = -1;
                }
                else if (lalt || other) { typeSpoiled = true; }
            }
        }
    }
}

/** Other apps' sound, quieter while you talk to Nova (Windows' per-app volume, as in the Volume Mixer). */
static class Duck
{
    static readonly Dictionary<int, float> was = new Dictionary<int, float>(); // process id -> volume before
    static readonly Dictionary<int, float> set = new Dictionary<int, float>(); // process id -> the volume we set
    const float LEVEL = 0.25f;

    public static void On(string keep)
    {
        lock (was)
        {
            if (was.Count > 0) return;
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var n in keep.Split(',')) if (n.Trim().Length > 0) names.Add(n.Trim());
            Each((pid, vol) =>
            {
                string name = "";
                try { name = Process.GetProcessById(pid).ProcessName; } catch { }
                if (names.Contains(name)) return;
                float v; vol.GetMasterVolume(out v);
                if (v <= 0.01f || was.ContainsKey(pid)) return;
                Guid g = Guid.Empty;
                vol.SetMasterVolume(v * LEVEL, ref g);
                was[pid] = v; set[pid] = v * LEVEL;
            });
        }
    }

    public static void Off()
    {
        lock (was)
        {
            if (was.Count == 0) return;
            Each((pid, vol) =>
            {
                float before;
                if (!was.TryGetValue(pid, out before)) return;
                float v; vol.GetMasterVolume(out v);
                if (Math.Abs(v - set[pid]) > 0.02f) return; // you changed it meanwhile: leave yours
                Guid g = Guid.Empty;
                vol.SetMasterVolume(before, ref g);
            });
            was.Clear(); set.Clear();
        }
    }

    static void Each(Action<int, ISimpleAudioVolume> f)
    {
        try
        {
            var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
            IMMDevice dev;
            if (en.GetDefaultAudioEndpoint(0 /* render */, 1 /* multimedia */, out dev) != 0) return;
            Guid iid = typeof(IAudioSessionManager2).GUID;
            object o;
            if (dev.Activate(ref iid, 23 /* CLSCTX_ALL */, IntPtr.Zero, out o) != 0) return;
            IAudioSessionEnumerator list;
            if (((IAudioSessionManager2)o).GetSessionEnumerator(out list) != 0) return;
            int count; list.GetCount(out count);
            for (int i = 0; i < count; i++)
            {
                try
                {
                    IAudioSessionControl2 c;
                    if (list.GetSession(i, out c) != 0) continue;
                    if (c.IsSystemSoundsSession() == 0) continue; // S_OK means it is: Windows' own sounds stay
                    uint pid; c.GetProcessId(out pid);
                    if (pid == 0) continue;
                    f((int)pid, (ISimpleAudioVolume)c);
                }
                catch { }
            }
        }
        catch { }
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int mask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    }
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }
    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int n);
        [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s);
    }
    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int s);
        [PreserveSig] int GetDisplayName(out IntPtr n);
        [PreserveSig] int SetDisplayName(IntPtr n, IntPtr g);
        [PreserveSig] int GetIconPath(out IntPtr p);
        [PreserveSig] int SetIconPath(IntPtr p, IntPtr g);
        [PreserveSig] int GetGroupingParam(out Guid g);
        [PreserveSig] int SetGroupingParam(IntPtr g, IntPtr c);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool optOut);
    }
}

[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume
{
    [PreserveSig] int SetMasterVolume(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute(bool mute, ref Guid ctx);
    [PreserveSig] int GetMute(out bool mute);
}
