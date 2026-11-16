package com.studyhall.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * The app's side of "Hey Bauer" on Android: download the offline wake-word model, start/stop
 * the listening service, listen once with Android's own speech recogniser while Studyhall is
 * open, and hand over briefings that were written down while it was closed.
 */
@CapacitorPlugin(
    name = "Bauer",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class BauerPlugin extends Plugin {
    private static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
    private volatile boolean downloading = false;
    private volatile double progress = 0;
    private SpeechRecognizer recognizer;
    private boolean foreground = false;

    @Override
    public void load() {
        foreground = true; // plugins load while the app is starting in front
        // While Studyhall is open, the service hands the wake word to the app.
        BauerService.wakeHandler = () -> {
            if (!foreground || !hasListeners("wake")) return false;
            notifyListeners("wake", new JSObject());
            return true;
        };
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
        if (!pendingItems(false).isEmpty()) notifyListeners("pending", new JSObject());
    }

    @Override
    protected void handleOnPause() {
        foreground = false;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent != null && "review".equals(intent.getStringExtra("bauer"))) notifyListeners("pending", new JSObject());
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("modelReady", BauerService.modelReady(getContext()));
        r.put("downloading", downloading);
        r.put("progress", progress);
        r.put("running", BauerService.running);
        r.put("state", BauerService.state);
        r.put("mic", getPermissionState("microphone").toString().toLowerCase());
        r.put("recognizer", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("xiaomi", Build.MANUFACTURER != null && Build.MANUFACTURER.toLowerCase().matches(".*(xiaomi|redmi|poco).*"));
        call.resolve(r);
    }

    // ---------- Model download (once, ~40 MB) ----------

    @PluginMethod
    public void downloadModel(PluginCall call) {
        if (downloading) {
            call.reject("Already downloading");
            return;
        }
        downloading = true;
        progress = 0;
        new Thread(() -> {
            File dir = BauerService.modelDir(getContext());
            File tmp = new File(getContext().getFilesDir(), "vosk-model.part");
            try {
                deleteAll(tmp);
                HttpURLConnection c = (HttpURLConnection) new URL(MODEL_URL).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                long total = c.getContentLengthLong();
                long done = 0;
                long lastNote = 0;
                try (InputStream raw = c.getInputStream(); ZipInputStream zip = new ZipInputStream(new CountingStream(raw, n -> {}))) {
                    ZipEntry e;
                    byte[] buf = new byte[65536];
                    while ((e = zip.getNextEntry()) != null) {
                        String name = e.getName();
                        int slash = name.indexOf('/');
                        String rel = slash >= 0 ? name.substring(slash + 1) : name; // drop the top folder
                        if (rel.isEmpty() || rel.contains("..") || name.contains("__MACOSX")) continue;
                        File out = new File(tmp, rel);
                        if (e.isDirectory()) {
                            out.mkdirs();
                            continue;
                        }
                        out.getParentFile().mkdirs();
                        try (OutputStream o = new FileOutputStream(out)) {
                            int n;
                            while ((n = zip.read(buf)) > 0) {
                                o.write(buf, 0, n);
                                done += n;
                                long now = System.currentTimeMillis();
                                if (now - lastNote > 300) {
                                    lastNote = now;
                                    // (unzipped size is ~1.65× the download; good enough for a progress bar)
                                    progress = total > 0 ? Math.min(0.99, done / (total * 1.65)) : 0;
                                    JSObject p = new JSObject();
                                    p.put("progress", progress);
                                    notifyListeners("download", p);
                                }
                            }
                        }
                    }
                }
                if (!new File(tmp, "am/final.mdl").exists()) throw new IllegalStateException("The download looks broken. Try again.");
                deleteAll(dir);
                if (!tmp.renameTo(dir)) throw new IllegalStateException("Couldn’t save the speech model.");
                progress = 1;
                downloading = false;
                call.resolve();
            } catch (Exception e) {
                deleteAll(tmp);
                downloading = false;
                call.reject(e instanceof java.net.UnknownHostException ? "No internet connection — try again when you’re online." : String.valueOf(e.getMessage()));
            }
        }).start();
    }

    private interface Counter {
        void add(long n);
    }

    private static class CountingStream extends java.io.FilterInputStream {
        private final Counter counter;

        CountingStream(InputStream in, Counter c) {
            super(in);
            counter = c;
        }

        @Override
        public int read(byte[] b, int off, int len) throws java.io.IOException {
            int n = super.read(b, off, len);
            if (n > 0) counter.add(n);
            return n;
        }
    }

    private static void deleteAll(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteAll(k);
        f.delete();
    }

    // ---------- The listening service ----------

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "afterMicForStart");
            return;
        }
        reallyStart(call);
    }

    @PermissionCallback
    private void afterMicForStart(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Studyhall needs the microphone to hear “Hey Bauer”.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotificationsForStart");
            return;
        }
        reallyStart(call);
    }

    @PermissionCallback
    private void afterNotificationsForStart(PluginCall call) {
        reallyStart(call); // works without, but then you won't see "tap to check" notes
    }

    private void reallyStart(PluginCall call) {
        if (!BauerService.modelReady(getContext())) {
            call.reject("Download the speech model first.");
            return;
        }
        Intent i = new Intent(getContext(), BauerService.class).setAction(BauerService.ACTION_START);
        i.putExtra("sensitivity", call.getInt("sensitivity", 50));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Android wouldn’t let Studyhall listen in the background: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (BauerService.running) getContext().startService(new Intent(getContext(), BauerService.class).setAction(BauerService.ACTION_STOP));
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (BauerService.running) getContext().startService(new Intent(getContext(), BauerService.class).setAction(BauerService.ACTION_RESUME));
        call.resolve();
    }

    // ---------- Listening once, with Android's own recogniser (app open) ----------

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "afterMicForListen");
            return;
        }
        reallyListen(call);
    }

    @PermissionCallback
    private void afterMicForListen(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) call.reject("Studyhall needs the microphone for voice briefings.");
        else reallyListen(call);
    }

    private void reallyListen(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("no_recognizer");
            return;
        }
        // The wake-word service lets go of the microphone first.
        if (BauerService.running) getContext().startService(new Intent(getContext(), BauerService.class).setAction(BauerService.ACTION_PAUSE));
        call.setKeepAlive(true);
        getActivity().runOnUiThread(() -> {
            try {
                if (recognizer != null) recognizer.destroy();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en");
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1800);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 4000);
                recognizer.setRecognitionListener(new RecognitionListener() {
                    boolean done = false;

                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        notifyListeners("state", new JSObject().put("state", "listening"));
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        notifyListeners("state", new JSObject().put("state", "heard"));
                    }

                    @Override
                    public void onRmsChanged(float rmsdB) {
                        JSObject l = new JSObject();
                        l.put("level", Math.max(0, Math.min(1, (rmsdB + 2) / 12.0)));
                        notifyListeners("level", l);
                    }

                    @Override
                    public void onBufferReceived(byte[] buffer) {
                    }

                    @Override
                    public void onEndOfSpeech() {
                        notifyListeners("state", new JSObject().put("state", "thinking"));
                    }

                    @Override
                    public void onError(int error) {
                        if (done) return;
                        done = true;
                        String why;
                        switch (error) {
                            case SpeechRecognizer.ERROR_NO_MATCH:
                            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                                why = "nothing";
                                break;
                            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                                why = "Studyhall needs the microphone for voice briefings.";
                                break;
                            case SpeechRecognizer.ERROR_NETWORK:
                            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                                why = "Speech recognition needs the internet on this device right now.";
                                break;
                            default:
                                why = "Speech recognition stopped (error " + error + ").";
                        }
                        call.setKeepAlive(false);
                        call.reject(why);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        if (done) return;
                        done = true;
                        ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        JSObject r = new JSObject();
                        r.put("text", list != null && !list.isEmpty() ? list.get(0) : "");
                        call.setKeepAlive(false);
                        call.resolve(r);
                    }

                    @Override
                    public void onPartialResults(Bundle partial) {
                        ArrayList<String> list = partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (list != null && !list.isEmpty()) notifyListeners("partial", new JSObject().put("text", list.get(0)));
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {
                    }
                });
                recognizer.startListening(intent);
            } catch (Exception e) {
                call.setKeepAlive(false);
                call.reject("Speech recognition couldn’t start: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
            call.resolve();
        });
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) {
                recognizer.cancel();
                recognizer.destroy();
                recognizer = null;
            }
            call.resolve();
        });
    }

    // ---------- Briefings written down while Studyhall was closed ----------

    private JSONArray pendingItems(boolean clear) {
        SharedPreferences p = getContext().getSharedPreferences(BauerService.PREFS, Context.MODE_PRIVATE);
        JSONArray a;
        try {
            a = new JSONArray(p.getString("pending", "[]"));
        } catch (Exception e) {
            a = new JSONArray();
        }
        if (clear) p.edit().putString("pending", "[]").apply();
        return a;
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSONArray a = pendingItems(true);
        JSArray items = new JSArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) items.put(o);
        }
        JSObject r = new JSObject();
        r.put("items", items);
        call.resolve(r);
    }

    // ---------- Battery settings (Xiaomi kills background apps unless told not to) ----------

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context c = getContext();
        String pkg = c.getPackageName();
        Intent[] tries = new Intent[] {
            new Intent().setComponent(new ComponentName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")).putExtra("package_name", pkg).putExtra("package_label", "Studyhall"),
            new Intent().setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
        };
        for (Intent i : tries) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
                call.resolve();
                return;
            } catch (ActivityNotFoundException | SecurityException ignored) {
            }
        }
        call.reject("Couldn’t open the battery settings");
    }
}
