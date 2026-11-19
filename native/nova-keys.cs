// nova-keys: Nova's talk keys for Studyhall (Windows).
//  • Hold Ctrl + Alt (left Alt, so AltGr never triggers it) = talk. Prints "ptt-down", then "ptt-up"
//    when you let go, or "ptt-cancel" if another key joins in (a normal Ctrl+Alt+something shortcut).
//  • Tap Ctrl + Shift on their own = type. Prints "type".
//  • Esc pressed = "esc" (Nova stops talking or drawing, from any app).
//  • Only while Studyhall asks ("clicks on" on its input, until "clicks off"): a left mouse click = "click" (a drawn
//    walkthrough waiting for your click on a step). Studyhall reads where the cursor is itself.
//  • Only while the pen is on ("pen on" … "pen off"): the left button pressed and let go ("lmb-down", "lmb-up": the
//    pen draws while it's held) and the right button pressed ("rmb-down": undo the last mark).
// It only checks those keys a few times a second (GetAsyncKeyState); it never records or prints which other keys you
// press. It exits when Studyhall closes its input.

using System;
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
                }
            }
            catch { }
            Environment.Exit(0);
        }) { IsBackground = true }.Start();
        bool escWas = false, clickWas = false, lmbWas = false, rmbWas = false;

        const int TICK = 25, HOLD_MS = 250, TAP_MS = 600;
        int talkHeld = 0;      // ms Ctrl+Alt has been held on their own
        bool talking = false;  // "ptt-down" sent
        bool spoiled = false;  // another key joined: wait until everything is released
        int typeHeld = -1;     // ms Ctrl+Shift held on their own (-1 = not in a tap)
        bool typeSpoiled = false;

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
