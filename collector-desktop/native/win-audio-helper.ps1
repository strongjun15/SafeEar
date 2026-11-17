# SafeEar Windows audio helper
#
# Reads, once per second, through Windows Core Audio:
#   - default render endpoint: id, friendly name, form factor (headphones / speakers ...)
#   - master volume (scalar 0..1 and dB) and mute state
#   - active audio sessions with their peak meter and process name (which app is playing)
# and writes one JSON line per second to stdout.
#
# stdin commands:  "setvol 0.35"  -> set master volume scalar (only used for the optional
#                                   H.870 "reduce volume if warning is ignored" feature)
# When stdin closes (parent app exits), the helper exits.
#
# Keep this file ASCII only: Windows PowerShell 5.1 reads BOM-less scripts with the ANSI code page.
# The C# below must stay C# 5 compatible (no string interpolation, no ?. etc.) for Add-Type on PS 5.1.

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace SafeEarAudio
{
    [StructLayout(LayoutKind.Sequential)]
    public struct PropertyKey
    {
        public Guid fmtid;
        public int pid;
        public PropertyKey(Guid f, int p) { fmtid = f; pid = p; }
    }

    // PROPVARIANT is 16 bytes on x86 and 24 bytes on x64. The extra field keeps enough room on x64.
    [StructLayout(LayoutKind.Explicit)]
    public struct PropVariant
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
        [FieldOffset(8)] public uint uintValue;
        [FieldOffset(16)] public IntPtr reserved;
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(int stgmAccess, out IPropertyStore properties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int GetChannelCount(out int count);
        [PreserveSig] int SetMasterVolumeLevel(float levelDB, ref Guid ctx);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        [PreserveSig] int GetMasterVolumeLevel(out float levelDB);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(int channel, float levelDB, ref Guid ctx);
        [PreserveSig] int SetChannelVolumeLevelScalar(int channel, float level, ref Guid ctx);
        [PreserveSig] int GetChannelVolumeLevel(int channel, out float levelDB);
        [PreserveSig] int GetChannelVolumeLevelScalar(int channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        [PreserveSig] int GetVolumeStepInfo(out int step, out int stepCount);
        [PreserveSig] int VolumeStepUp(ref Guid ctx);
        [PreserveSig] int VolumeStepDown(ref Guid ctx);
        [PreserveSig] int QueryHardwareSupport(out int mask);
        [PreserveSig] int GetVolumeRange(out float minDB, out float maxDB, out float incDB);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
        [PreserveSig] int RegisterSessionNotification(IntPtr notify);
        [PreserveSig] int UnregisterSessionNotification(IntPtr notify);
        [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr notify);
        [PreserveSig] int UnregisterDuckNotification(IntPtr notify);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl session);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
        [PreserveSig] int GetGroupingParam(out Guid groupingId);
        [PreserveSig] int SetGroupingParam(ref Guid groupingId, ref Guid ctx);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr notify);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notify);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
        [PreserveSig] int GetGroupingParam(out Guid groupingId);
        [PreserveSig] int SetGroupingParam(ref Guid groupingId, ref Guid ctx);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr notify);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notify);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetProcessId(out int pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
    }

    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioMeterInformation
    {
        [PreserveSig] int GetPeakValue(out float peak);
        [PreserveSig] int GetMeteringChannelCount(out int count);
        [PreserveSig] int GetChannelsPeakValues(int count, IntPtr peaks);
        [PreserveSig] int QueryHardwareSupport(out int mask);
    }

    public static class Helper
    {
        const int eRender = 0;
        const int eMultimedia = 1;
        const int CLSCTX_ALL = 23;
        const int STGM_READ = 0;
        const ushort VT_LPWSTR = 31;
        const ushort VT_UI4 = 19;

        static readonly Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        static readonly Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        static readonly PropertyKey PKEY_FriendlyName = new PropertyKey(new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), 14);
        static readonly PropertyKey PKEY_FormFactor = new PropertyKey(new Guid("1DA5D803-D492-4EDD-8C23-E0C0FFEE7F0E"), 0);

        [DllImport("ole32.dll")]
        static extern int PropVariantClear(ref PropVariant pvar);

        static readonly object Gate = new object();
        static readonly Queue<string> Commands = new Queue<string>();
        static readonly Dictionary<int, string> ProcessNames = new Dictionary<int, string>();

        public static void Run()
        {
            Thread reader = new Thread(ReadCommands);
            reader.IsBackground = true;
            reader.Start();

            Thread worker = new Thread(Loop);
            worker.SetApartmentState(ApartmentState.MTA);
            worker.IsBackground = false;
            worker.Start();
            worker.Join();
        }

        static void ReadCommands()
        {
            while (true)
            {
                string line = Console.In.ReadLine();
                if (line == null) { Environment.Exit(0); }
                lock (Gate) { Commands.Enqueue(line.Trim()); }
            }
        }

        static void Release(object o)
        {
            if (o != null && Marshal.IsComObject(o)) { try { Marshal.ReleaseComObject(o); } catch { } }
        }

        static void Loop()
        {
            IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            Dictionary<int, float> peaks = new Dictionary<int, float>();
            int tick = 0;
            while (true)
            {
                try
                {
                    IMMDevice device;
                    int hr = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia, out device);
                    if (hr != 0 || device == null)
                    {
                        if (tick % 4 == 0) Emit("{\"ok\":false,\"error\":\"no-output-device\"}");
                    }
                    else
                    {
                        try
                        {
                            HandleCommands(device);
                            SampleSessions(device, peaks);
                            if (tick % 4 == 0)
                            {
                                Emit(BuildReport(device, peaks));
                                peaks.Clear();
                            }
                        }
                        finally { Release(device); }
                    }
                }
                catch (Exception ex)
                {
                    if (tick % 4 == 0) Emit("{\"ok\":false,\"error\":" + Str(ex.GetType().Name + ": " + ex.Message) + "}");
                }
                tick++;
                Thread.Sleep(250);
            }
        }

        static void HandleCommands(IMMDevice device)
        {
            string cmd = null;
            lock (Gate) { if (Commands.Count > 0) cmd = Commands.Dequeue(); }
            if (cmd == null || !cmd.StartsWith("setvol ")) return;
            float v;
            if (!float.TryParse(cmd.Substring(7), NumberStyles.Float, CultureInfo.InvariantCulture, out v)) return;
            IAudioEndpointVolume vol = ActivateVolume(device);
            if (vol == null) return;
            try
            {
                Guid ctx = Guid.Empty;
                vol.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), ref ctx);
            }
            finally { Release(vol); }
        }

        static IAudioEndpointVolume ActivateVolume(IMMDevice device)
        {
            Guid iid = IID_IAudioEndpointVolume;
            object o;
            if (device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o) != 0) return null;
            return o as IAudioEndpointVolume;
        }

        static void SampleSessions(IMMDevice device, Dictionary<int, float> peaks)
        {
            Guid iid = IID_IAudioSessionManager2;
            object o;
            if (device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o) != 0) return;
            IAudioSessionManager2 mgr = o as IAudioSessionManager2;
            if (mgr == null) { Release(o); return; }
            IAudioSessionEnumerator sessions = null;
            try
            {
                if (mgr.GetSessionEnumerator(out sessions) != 0 || sessions == null) return;
                int count;
                sessions.GetCount(out count);
                for (int i = 0; i < count; i++)
                {
                    IAudioSessionControl ctl = null;
                    try
                    {
                        if (sessions.GetSession(i, out ctl) != 0 || ctl == null) continue;
                        int state;
                        ctl.GetState(out state);
                        if (state != 1) continue; // AudioSessionStateActive
                        IAudioSessionControl2 ctl2 = ctl as IAudioSessionControl2;
                        IAudioMeterInformation meter = ctl as IAudioMeterInformation;
                        if (ctl2 == null || meter == null) continue;
                        int pid;
                        ctl2.GetProcessId(out pid);
                        if (pid == 0) continue; // system sounds
                        float peak;
                        if (meter.GetPeakValue(out peak) != 0) continue;
                        float prev;
                        if (!peaks.TryGetValue(pid, out prev) || peak > prev) peaks[pid] = peak;
                    }
                    finally { Release(ctl); }
                }
            }
            finally
            {
                Release(sessions);
                Release(mgr);
            }
        }

        static string BuildReport(IMMDevice device, Dictionary<int, float> peaks)
        {
            string id;
            device.GetId(out id);
            string name = null;
            int formFactor = -1;
            IPropertyStore props;
            if (device.OpenPropertyStore(STGM_READ, out props) == 0 && props != null)
            {
                try
                {
                    PropertyKey k1 = PKEY_FriendlyName;
                    PropVariant v1;
                    if (props.GetValue(ref k1, out v1) == 0)
                    {
                        if (v1.vt == VT_LPWSTR && v1.pointerValue != IntPtr.Zero) name = Marshal.PtrToStringUni(v1.pointerValue);
                        PropVariantClear(ref v1);
                    }
                    PropertyKey k2 = PKEY_FormFactor;
                    PropVariant v2;
                    if (props.GetValue(ref k2, out v2) == 0)
                    {
                        if (v2.vt == VT_UI4) formFactor = (int)v2.uintValue;
                        PropVariantClear(ref v2);
                    }
                }
                finally { Release(props); }
            }

            float scalar = -1f, db = 0f, minDb = 0f, maxDb = 0f, inc = 0f;
            bool muted = false;
            IAudioEndpointVolume vol = ActivateVolume(device);
            if (vol != null)
            {
                try
                {
                    vol.GetMasterVolumeLevelScalar(out scalar);
                    vol.GetMasterVolumeLevel(out db);
                    vol.GetMute(out muted);
                    vol.GetVolumeRange(out minDb, out maxDb, out inc);
                }
                finally { Release(vol); }
            }

            StringBuilder sb = new StringBuilder();
            sb.Append("{\"ok\":true,\"device\":{\"id\":").Append(Str(id));
            sb.Append(",\"name\":").Append(Str(name));
            sb.Append(",\"formFactor\":").Append(formFactor < 0 ? "null" : formFactor.ToString(CultureInfo.InvariantCulture));
            sb.Append("},\"volume\":{");
            if (scalar >= 0f)
            {
                // GetMasterVolumeLevel is relative to the device range; express it relative to the maximum (0 dB at 100%).
                sb.Append("\"scalar\":").Append(Num(scalar));
                sb.Append(",\"db\":").Append(Num(db - maxDb));
                sb.Append(",\"minDb\":").Append(Num(minDb - maxDb));
                sb.Append(",\"muted\":").Append(muted ? "true" : "false");
            }
            sb.Append("},\"sessions\":[");
            bool first = true;
            foreach (KeyValuePair<int, float> kv in peaks)
            {
                if (kv.Value < 0.0005f) continue;
                if (!first) sb.Append(',');
                first = false;
                sb.Append("{\"pid\":").Append(kv.Key.ToString(CultureInfo.InvariantCulture));
                sb.Append(",\"name\":").Append(Str(ProcessName(kv.Key)));
                sb.Append(",\"peak\":").Append(Num(kv.Value)).Append('}');
            }
            sb.Append("]}");
            return sb.ToString();
        }

        static string ProcessName(int pid)
        {
            string n;
            if (ProcessNames.TryGetValue(pid, out n)) return n;
            n = null;
            try
            {
                Process p = Process.GetProcessById(pid);
                n = p.ProcessName;
                try
                {
                    string desc = p.MainModule.FileVersionInfo.FileDescription;
                    if (!string.IsNullOrEmpty(desc) && desc.Length <= 40) n = desc;
                }
                catch { }
            }
            catch { }
            if (n == null) n = "pid " + pid.ToString(CultureInfo.InvariantCulture);
            if (ProcessNames.Count > 500) ProcessNames.Clear();
            ProcessNames[pid] = n;
            return n;
        }

        static string Num(float v)
        {
            if (float.IsNaN(v) || float.IsInfinity(v)) return "null";
            return v.ToString("0.#####", CultureInfo.InvariantCulture);
        }

        // JSON string with every non-ASCII character escaped, so the output is pure ASCII.
        static string Str(string s)
        {
            if (s == null) return "null";
            StringBuilder sb = new StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (char c in s)
            {
                if (c == '"') sb.Append("\\\"");
                else if (c == '\\') sb.Append("\\\\");
                else if (c < 0x20 || c > 0x7e) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append('"');
            return sb.ToString();
        }

        static void Emit(string line)
        {
            Console.Out.WriteLine(line);
            Console.Out.Flush();
        }
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp
[SafeEarAudio.Helper]::Run()
