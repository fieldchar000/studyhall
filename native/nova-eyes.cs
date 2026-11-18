// nova-eyes: how Nova sees and (when you allow it) works the app you're using, through Windows UI
// Automation, the accessibility system screen readers use. Studyhall talks to it with one JSON
// request per line on its input; it answers one JSON line per request. It never sends anything
// anywhere else, and quits when Studyhall closes its input.
//
// Requests:
//   {"cmd":"snapshot","exclude":[pid,...],"hwnd":0,"offscreen":false}
//       → the window you're using (skipping Studyhall's own windows): its title, app and position,
//         plus its buttons, menus, links, fields and text, each with an id and screen position.
//   {"cmd":"invoke","id":7}          press a button / link / menu item (no mouse needed)
//   {"cmd":"toggle","id":7}          tick or untick a checkbox
//   {"cmd":"select","id":7}          choose a list item or tab
//   {"cmd":"expand","id":7}          open a drop-down or tree branch
//   {"cmd":"setValue","id":7,"text":"..."}  fill a text field
//   {"cmd":"focus","id":7}           put the keyboard focus on it
//   {"cmd":"waitClick","rect":[x,y,w,h],"timeoutMs":60000}  wait until you click inside that box
//   {"cmd":"esc"}                    has Esc been pressed since the last time we asked? (stops Nova's hands)
//   {"cmd":"selection","exclude":[pid,...]}  the text you've highlighted in the app you're using, and where it is
//   {"cmd":"typeText","text":"...","exclude":[pid,...]}  type into the box you're in (never a password box, never Studyhall)
//   {"cmd":"windows","exclude":[pid,...]}  the windows you have open (title, app)
//   {"cmd":"arrange","items":[{"query":"word","pos":"left|right|top|bottom|full|center"}],"exclude":[...]}  put windows side by side
// Positions are physical screen pixels (this program is DPI-aware).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Automation;

static class NovaEyes
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr hMon, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

    const uint GW_HWNDNEXT = 2, GA_ROOT = 2;
    const int GWL_EXSTYLE = -20, WS_EX_TOOLWINDOW = 0x80;

    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
    static readonly Dictionary<int, AutomationElement> Known = new Dictionary<int, AutomationElement>();

    static void Reply(object o) { Console.Out.WriteLine(Json.Serialize(o)); Console.Out.Flush(); }

    [STAThread]
    static void Main()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } // per-monitor v2: real pixels
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            Dictionary<string, object> req;
            try { req = Json.Deserialize<Dictionary<string, object>>(line); }
            catch { Reply(new { ok = false, error = "bad request" }); continue; }
            object seq; req.TryGetValue("seq", out seq);
            try
            {
                var res = Handle(req);
                res["seq"] = seq;
                Reply(res);
            }
            catch (Exception e)
            {
                Reply(new Dictionary<string, object> { { "seq", seq }, { "ok", false }, { "error", e.Message } });
            }
        }
    }

    static int Int(Dictionary<string, object> r, string k, int def = 0)
    {
        object v; return r.TryGetValue(k, out v) && v != null ? Convert.ToInt32(v) : def;
    }

    static Dictionary<string, object> Ok(params object[] kv)
    {
        var d = new Dictionary<string, object> { { "ok", true } };
        for (int i = 0; i + 1 < kv.Length; i += 2) d[(string)kv[i]] = kv[i + 1];
        return d;
    }

    static AutomationElement El(Dictionary<string, object> r)
    {
        AutomationElement e;
        if (!Known.TryGetValue(Int(r, "id", -1), out e)) throw new Exception("That control isn't on screen any more");
        return e;
    }

    static Dictionary<string, object> Handle(Dictionary<string, object> r)
    {
        string cmd = r.ContainsKey("cmd") ? Convert.ToString(r["cmd"]) : "";
        switch (cmd)
        {
            case "snapshot": return Snapshot(r);
            case "window": return WindowInfo(r);
            case "selection": return Selection(r);
            case "typeText": return TypeText(r);
            case "windows": return Windows(r);
            case "arrange": return Arrange(r);
            case "invoke":
                {
                    var e = El(r); object p;
                    if (e.TryGetCurrentPattern(InvokePattern.Pattern, out p)) { ((InvokePattern)p).Invoke(); return Ok("did", "invoke"); }
                    if (e.TryGetCurrentPattern(TogglePattern.Pattern, out p)) { ((TogglePattern)p).Toggle(); return Ok("did", "toggle"); }
                    if (e.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) { ((SelectionItemPattern)p).Select(); return Ok("did", "select"); }
                    if (e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out p)) { ((ExpandCollapsePattern)p).Expand(); return Ok("did", "expand"); }
                    throw new Exception("That control can't be pressed without the mouse");
                }
            case "toggle": { object p; if (!El(r).TryGetCurrentPattern(TogglePattern.Pattern, out p)) throw new Exception("Not a checkbox"); ((TogglePattern)p).Toggle(); return Ok(); }
            case "select": { object p; if (!El(r).TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) throw new Exception("Can't be selected"); ((SelectionItemPattern)p).Select(); return Ok(); }
            case "expand":
                {
                    object p; if (!El(r).TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out p)) throw new Exception("Can't be opened");
                    var ec = (ExpandCollapsePattern)p;
                    if (ec.Current.ExpandCollapseState == ExpandCollapseState.Expanded) ec.Collapse(); else ec.Expand();
                    return Ok();
                }
            case "setValue":
                {
                    object p; var e = El(r);
                    if (!e.TryGetCurrentPattern(ValuePattern.Pattern, out p)) throw new Exception("Not a text field");
                    var vp = (ValuePattern)p;
                    if (vp.Current.IsReadOnly) throw new Exception("That field is read-only");
                    if (e.Current.IsPassword) throw new Exception("Nova never types into password fields");
                    vp.SetValue(r.ContainsKey("text") ? Convert.ToString(r["text"]) : "");
                    return Ok();
                }
            case "focus": El(r).SetFocus(); return Ok();
            case "waitClick": return WaitClick(r);
            case "esc": return Ok("pressed", (GetAsyncKeyState(0x1B) & 0x0001) != 0 || (GetAsyncKeyState(0x1B) & 0x8000) != 0);
            default: throw new Exception("unknown command");
        }
    }

    // ---------- Seeing ----------

    static IntPtr TargetWindow(Dictionary<string, object> r)
    {
        int asked = Int(r, "hwnd");
        if (asked != 0) return new IntPtr(asked);
        var exclude = new HashSet<uint>();
        object ex;
        if (r.TryGetValue("exclude", out ex) && ex is object[])
            foreach (var p in (object[])ex) exclude.Add(Convert.ToUInt32(p));
        // The window you're using; if that's Studyhall itself (e.g. the typing box), the one beneath it.
        var h = GetForegroundWindow();
        for (int guard = 0; h != IntPtr.Zero && guard < 400; guard++, h = GetWindow(h, GW_HWNDNEXT))
        {
            h = GetAncestor(h, GA_ROOT);
            if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0) continue;
            if ((GetWindowLong(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) continue;
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (exclude.Contains(pid)) continue;
            return h;
        }
        return IntPtr.Zero;
    }

    /** Just the window you are using: title, app and position (fast; no controls). */
    // The highlighted text: the selection of the focused text (or the document around it), with its screen box.
    static Dictionary<string, object> Selection(Dictionary<string, object> r)
    {
        var skip = new HashSet<int>();
        if (r.ContainsKey("exclude") && r["exclude"] is System.Collections.IEnumerable)
            foreach (var x in (System.Collections.IEnumerable)r["exclude"]) skip.Add(Convert.ToInt32(x));
        var e = AutomationElement.FocusedElement;
        if (e == null || skip.Contains(e.Current.ProcessId)) return Ok("text", "");
        var walk = TreeWalker.ControlViewWalker;
        for (int i = 0; e != null && i < 10; i++)
        {
            object p;
            if (e.TryGetCurrentPattern(TextPattern.Pattern, out p))
            {
                var sel = ((TextPattern)p).GetSelection();
                if (sel.Length == 0) return Ok("text", "");
                string text = sel[0].GetText(6000);
                if (string.IsNullOrWhiteSpace(text)) return Ok("text", "");
                double x0 = double.MaxValue, y0 = double.MaxValue, x1 = double.MinValue, y1 = double.MinValue;
                foreach (var b in sel[0].GetBoundingRectangles())
                {
                    if (b.Width <= 0 || b.Height <= 0) continue;
                    x0 = Math.Min(x0, b.X); y0 = Math.Min(y0, b.Y); x1 = Math.Max(x1, b.X + b.Width); y1 = Math.Max(y1, b.Y + b.Height);
                }
                var rect = x0 < x1 ? new[] { (int)x0, (int)y0, (int)(x1 - x0), (int)(y1 - y0) } : null;
                return Ok("text", text, "rect", rect);
            }
            e = walk.GetParent(e);
        }
        return Ok("text", "");
    }

    static HashSet<uint> Excluded(Dictionary<string, object> r)
    {
        var ex = new HashSet<uint>();
        object v;
        if (r.TryGetValue("exclude", out v) && v is System.Collections.IEnumerable)
            foreach (var p in (System.Collections.IEnumerable)v) ex.Add(Convert.ToUInt32(p));
        return ex;
    }

    // Typing for you (dictation): into the focused box of the app you're using, as if typed on the keyboard.
    static Dictionary<string, object> TypeText(Dictionary<string, object> r)
    {
        string text = r.ContainsKey("text") ? Convert.ToString(r["text"]) : "";
        if (text.Length == 0) return Ok();
        if (text.Length > 20000) throw new Exception("That's too long to type");
        var focused = AutomationElement.FocusedElement;
        if (focused == null) throw new Exception("No text box has the focus");
        if (Excluded(r).Contains((uint)focused.Current.ProcessId)) throw new Exception("Click into the box you want it typed in first");
        if (focused.Current.IsPassword) throw new Exception("That's a password box: Nova never types there");
        var inputs = new List<INPUT>();
        foreach (char c in text.Replace("\r\n", "\n"))
        {
            if (c == '\n')
            {
                inputs.Add(Key(0x0D, '\0', 0)); inputs.Add(Key(0x0D, '\0', 2)); // Enter
                continue;
            }
            inputs.Add(Key(0, c, 4)); inputs.Add(Key(0, c, 4 | 2)); // KEYEVENTF_UNICODE (down, up)
        }
        var arr = inputs.ToArray();
        for (int i = 0; i < arr.Length; i += 200)
        {
            int n = Math.Min(200, arr.Length - i);
            var part = new INPUT[n];
            Array.Copy(arr, i, part, 0, n);
            SendInput((uint)n, part, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(15);
        }
        return Ok("typed", text.Length);
    }
    static INPUT Key(ushort vk, char ch, uint flags)
    {
        var i = new INPUT { type = 1 };
        i.u.ki = new KEYBDINPUT { wVk = vk, wScan = ch, dwFlags = flags };
        return i;
    }

    static List<Dictionary<string, object>> ListWindows(HashSet<uint> exclude)
    {
        var list = new List<Dictionary<string, object>>();
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0) return true;
            if ((GetWindowLong(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return true;
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (exclude.Contains(pid)) return true;
            var sb = new StringBuilder(512);
            GetWindowText(h, sb, 512);
            string app = "";
            try { app = Process.GetProcessById((int)pid).ProcessName; } catch { }
            if (app == "ApplicationFrameHost" && sb.Length == 0) return true;
            list.Add(new Dictionary<string, object> { { "hwnd", h.ToInt64() }, { "title", sb.ToString() }, { "app", app } });
            return list.Count < 60;
        }, IntPtr.Zero);
        return list;
    }
    static Dictionary<string, object> Windows(Dictionary<string, object> r) { return Ok("windows", ListWindows(Excluded(r))); }

    // Put your windows where you ask: left or right half, top or bottom, full screen, or centred.
    static Dictionary<string, object> Arrange(Dictionary<string, object> r)
    {
        var wins = ListWindows(Excluded(r));
        var done = new List<string>();
        var missing = new List<string>();
        var items = r.ContainsKey("items") && r["items"] is System.Collections.IEnumerable ? (System.Collections.IEnumerable)r["items"] : new object[0];
        IntPtr first = IntPtr.Zero;
        foreach (var o in items)
        {
            var it = o as Dictionary<string, object>;
            if (it == null) continue;
            string q = Convert.ToString(it.ContainsKey("query") ? it["query"] : "").ToLowerInvariant();
            string pos = Convert.ToString(it.ContainsKey("pos") ? it["pos"] : "full");
            Dictionary<string, object> hit = null;
            foreach (var w in wins)
                if (((string)w["title"]).ToLowerInvariant().Contains(q) || ((string)w["app"]).ToLowerInvariant().Contains(q)) { hit = w; break; }
            if (hit == null || q.Length == 0) { missing.Add(q); continue; }
            var h = new IntPtr(Convert.ToInt64(hit["hwnd"]));
            if (first == IntPtr.Zero) first = h;
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
            GetMonitorInfo(MonitorFromWindow(first, 2), ref mi);
            int x = mi.rcWork.L, y = mi.rcWork.T, w2 = mi.rcWork.R - mi.rcWork.L, h2 = mi.rcWork.B - mi.rcWork.T;
            ShowWindow(h, 9); // restore (out of maximised or minimised)
            if (pos == "full") ShowWindow(h, 3);
            else
            {
                int px = x, py = y, pw = w2, ph = h2;
                if (pos == "left") pw = w2 / 2;
                else if (pos == "right") { px = x + w2 / 2; pw = w2 - w2 / 2; }
                else if (pos == "top") ph = h2 / 2;
                else if (pos == "bottom") { py = y + h2 / 2; ph = h2 - h2 / 2; }
                else if (pos == "center") { pw = w2 * 2 / 3; ph = h2 * 4 / 5; px = x + (w2 - pw) / 2; py = y + (h2 - ph) / 2; }
                SetWindowPos(h, IntPtr.Zero, px, py, pw, ph, 0x0004 | 0x0040);
            }
            SetForegroundWindow(h);
            done.Add((string)hit["title"]);
        }
        return Ok("arranged", done, "missing", missing);
    }

    static Dictionary<string, object> WindowInfo(Dictionary<string, object> r)
    {
        var hwnd = TargetWindow(r);
        if (hwnd == IntPtr.Zero) throw new Exception("No window");
        uint pid; GetWindowThreadProcessId(hwnd, out pid);
        string app = "";
        try { app = Process.GetProcessById((int)pid).ProcessName; } catch { }
        var root = AutomationElement.FromHandle(hwnd);
        var wr = root.Current.BoundingRectangle;
        return Ok("window", new Dictionary<string, object> { { "hwnd", hwnd.ToInt64() }, { "title", root.Current.Name }, { "app", app }, { "pid", pid }, { "rect", new[] { (int)wr.X, (int)wr.Y, (int)wr.Width, (int)wr.Height } } });
    }

    static readonly HashSet<string> Interactive = new HashSet<string> {
        "Button", "SplitButton", "MenuItem", "Hyperlink", "CheckBox", "RadioButton", "ComboBox", "Edit",
        "ListItem", "TabItem", "TreeItem", "Slider", "Spinner", "MenuBar", "Menu", "Document", "DataItem", "Image"
    };

    static Dictionary<string, object> Snapshot(Dictionary<string, object> r)
    {
        var hwnd = TargetWindow(r);
        if (hwnd == IntPtr.Zero) throw new Exception("No window to look at");
        bool offscreen = r.ContainsKey("offscreen") && Convert.ToBoolean(r["offscreen"]);
        var root = AutomationElement.FromHandle(hwnd);
        uint pid; GetWindowThreadProcessId(hwnd, out pid);
        string app = "";
        try { app = Process.GetProcessById((int)pid).ProcessName; } catch { }
        var wr = root.Current.BoundingRectangle;

        var cache = new CacheRequest();
        cache.Add(AutomationElement.NameProperty);
        cache.Add(AutomationElement.ControlTypeProperty);
        cache.Add(AutomationElement.BoundingRectangleProperty);
        cache.Add(AutomationElement.IsEnabledProperty);
        cache.Add(AutomationElement.IsOffscreenProperty);
        cache.Add(AutomationElement.HelpTextProperty);
        cache.Add(AutomationElement.AutomationIdProperty);
        cache.Add(AutomationElement.IsInvokePatternAvailableProperty);
        cache.Add(AutomationElement.IsTogglePatternAvailableProperty);
        cache.Add(AutomationElement.IsValuePatternAvailableProperty);
        cache.Add(AutomationElement.IsSelectionItemPatternAvailableProperty);
        cache.Add(AutomationElement.IsExpandCollapsePatternAvailableProperty);
        cache.Add(AutomationElement.IsPasswordProperty);
        cache.TreeScope = TreeScope.Element;

        AutomationElementCollection all;
        using (cache.Activate()) all = root.FindAll(TreeScope.Descendants, Automation.ControlViewCondition);

        Known.Clear();
        var list = new List<Dictionary<string, object>>();
        var rest = new List<Dictionary<string, object>>();
        int id = 0;
        foreach (AutomationElement e in all)
        {
            if (list.Count + rest.Count > 3000) break;
            try
            {
                var c = e.Cached;
                string role = c.ControlType.ProgrammaticName.Replace("ControlType.", "");
                Rect b = c.BoundingRectangle;
                if (b.IsEmpty || b.Width < 2 || b.Height < 2) continue;
                if (c.IsOffscreen && !offscreen) continue;
                string name = (c.Name ?? "").Trim();
                if (name.Length > 160) name = name.Substring(0, 160) + "…";
                var actions = new List<string>();
                if ((bool)e.GetCachedPropertyValue(AutomationElement.IsInvokePatternAvailableProperty)) actions.Add("press");
                if ((bool)e.GetCachedPropertyValue(AutomationElement.IsTogglePatternAvailableProperty)) actions.Add("toggle");
                if ((bool)e.GetCachedPropertyValue(AutomationElement.IsSelectionItemPatternAvailableProperty)) actions.Add("select");
                if ((bool)e.GetCachedPropertyValue(AutomationElement.IsExpandCollapsePatternAvailableProperty)) actions.Add("expand");
                if ((bool)e.GetCachedPropertyValue(AutomationElement.IsValuePatternAvailableProperty)) actions.Add("type");
                bool interesting = actions.Count > 0 || Interactive.Contains(role) || (role == "Text" && name.Length > 0);
                if (!interesting || (name.Length == 0 && actions.Count == 0)) continue;
                id++;
                Known[id] = e;
                var item = new Dictionary<string, object> {
                    { "id", id }, { "role", role }, { "name", name },
                    { "rect", new[] { (int)b.X, (int)b.Y, (int)b.Width, (int)b.Height } },
                    { "enabled", c.IsEnabled }, { "actions", actions }
                };
                if (c.IsPassword) item["password"] = true; // Nova never types into these
                string help = c.HelpText;
                if (!string.IsNullOrEmpty(help) && help.Length < 120) item["hint"] = help;
                (actions.Count > 0 ? list : rest).Add(item);
            }
            catch (ElementNotAvailableException) { }
        }
        // Controls first, then text; at most 400 (big web pages have thousands).
        list.AddRange(rest);
        if (list.Count > 400) list = list.GetRange(0, 400);
        return Ok(
            "window", new Dictionary<string, object> {
                { "hwnd", hwnd.ToInt64() }, { "title", root.Current.Name }, { "app", app }, { "pid", pid },
                { "rect", new[] { (int)wr.X, (int)wr.Y, (int)wr.Width, (int)wr.Height } }
            },
            "elements", list,
            "total", all.Count);
    }

    // ---------- Waiting for your click (walkthroughs) ----------

    static Dictionary<string, object> WaitClick(Dictionary<string, object> r)
    {
        var rect = (object[])r["rect"];
        int x = Convert.ToInt32(rect[0]), y = Convert.ToInt32(rect[1]), w = Convert.ToInt32(rect[2]), h = Convert.ToInt32(rect[3]);
        int timeout = Int(r, "timeoutMs", 60000);
        var sw = Stopwatch.StartNew();
        bool wasDown = (GetAsyncKeyState(0x01) & 0x8000) != 0;
        while (sw.ElapsedMilliseconds < timeout)
        {
            Thread.Sleep(30);
            bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
            if (down && !wasDown)
            {
                POINT p; GetCursorPos(out p);
                bool inside = p.X >= x - 6 && p.X <= x + w + 6 && p.Y >= y - 6 && p.Y <= y + h + 6;
                if (inside) return Ok("clicked", true);
            }
            wasDown = down;
            if ((GetAsyncKeyState(0x1B) & 0x8000) != 0) return Ok("clicked", false, "cancelled", true); // Esc
        }
        return Ok("clicked", false);
    }
}
