package com.studyhall.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.File;

/**
 * "Hey Bauer" on the phone/tablet: a foreground service (with a small persistent notification,
 * so Android lets it keep the microphone while Studyhall is closed) that runs Vosk offline
 * keyword spotting. When it hears the wake word:
 *  - if Studyhall is open, it hands over to the app (which listens with Android's recogniser);
 *  - otherwise it beeps, writes down the briefing itself (Vosk, offline), keeps it for review
 *    and shows a notification: tap it to check the list of changes in Studyhall.
 */
public class BauerService extends Service {
    static final String TAG = "Bauer";
    static final String ACTION_START = "start";
    static final String ACTION_STOP = "stop";
    static final String ACTION_PAUSE = "pause";
    static final String ACTION_RESUME = "resume";
    static final String CHANNEL_LISTEN = "bauer_listen";
    static final String CHANNEL_HEARD = "bauer_heard";
    static final int NOTE_LISTEN = 7301;
    static final int NOTE_HEARD = 7302;
    static final String PREFS = "bauer";

    /** The app's side (BauerPlugin) when Studyhall is open; returns true if it takes over. */
    interface WakeHandler {
        boolean onWake();
    }

    static volatile WakeHandler wakeHandler;
    static volatile boolean running = false;
    static volatile String state = "off";

    private static final String GRAMMAR = "[\"hey bauer\", \"hi bauer\", \"okay bauer\", \"hey bower\", \"hey power\", \"bauer\", \"hey\", \"hi\", \"okay\", \"power\", \"hour\", \"our\", \"flower\", \"tower\", \"shower\", \"how are\", \"hello\", \"[unk]\"]";

    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private SpeechService speech;
    private int sensitivity = 50;
    private boolean paused = false;
    private long lastWake = 0;

    // Background capture of a briefing
    private boolean capturing = false;
    private final StringBuilder said = new StringBuilder();
    private long lastSpeech = 0;
    private long captureStart = 0;
    private final Runnable captureTick = new Runnable() {
        @Override
        public void run() {
            if (!capturing) return;
            long now = System.currentTimeMillis();
            boolean spoke = said.length() > 0 || lastSpeech > 0;
            if ((spoke && now - lastSpeech > 2200) || now - captureStart > 40000 || (!spoke && now - captureStart > 8000)) finishCapture();
            else main.postDelayed(this, 250);
        }
    };

    static File modelDir(Context c) {
        return new File(c.getFilesDir(), "vosk-model");
    }

    static boolean modelReady(Context c) {
        return new File(modelDir(c), "am/final.mdl").exists();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null ? intent.getAction() : ACTION_START;
        if (intent != null) sensitivity = intent.getIntExtra("sensitivity", sensitivity);
        switch (action) {
            case ACTION_STOP:
                stopEverything();
                stopSelf();
                return START_NOT_STICKY;
            case ACTION_PAUSE:
                paused = true;
                stopSpeech();
                setState("paused");
                return START_STICKY;
            case ACTION_RESUME:
                paused = false;
                startSpotting();
                return START_STICKY;
            default:
                goForeground();
                running = true;
                paused = false;
                if (model == null) loadModelThenSpot();
                else startSpotting();
                return START_STICKY;
        }
    }

    private void goForeground() {
        createChannels(this);
        Notification n = listeningNotification("Listening for “Hey Bauer”");
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTE_LISTEN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTE_LISTEN, n);
        } catch (Exception e) {
            Log.e(TAG, "Could not start listening in the background", e);
            setState("error");
            stopSelf();
        }
    }

    static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel listen = new NotificationChannel(CHANNEL_LISTEN, "Hey Bauer listening", NotificationManager.IMPORTANCE_LOW);
        listen.setDescription("Shown while Studyhall listens for “Hey Bauer”.");
        listen.setShowBadge(false);
        nm.createNotificationChannel(listen);
        NotificationChannel heard = new NotificationChannel(CHANNEL_HEARD, "Voice briefings", NotificationManager.IMPORTANCE_HIGH);
        heard.setDescription("Something you told Bauer, ready to check.");
        nm.createNotificationChannel(heard);
    }

    private PendingIntent openApp(String extra) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (extra != null) open.putExtra("bauer", extra);
        return PendingIntent.getActivity(this, extra == null ? 0 : 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification listeningNotification(String text) {
        Intent stop = new Intent(this, BauerService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 2, stop, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_LISTEN)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Studyhall")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openApp(null))
            .addAction(0, "Stop listening", stopPi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(NOTE_LISTEN, listeningNotification(text));
    }

    private void setState(String s) {
        state = s;
    }

    private void loadModelThenSpot() {
        setState("loading");
        new Thread(() -> {
            try {
                if (!modelReady(this)) throw new IllegalStateException("speech model not downloaded");
                Model m = new Model(modelDir(this).getAbsolutePath());
                main.post(() -> {
                    model = m;
                    if (running && !paused) startSpotting();
                });
            } catch (Throwable e) {
                Log.e(TAG, "Could not load the speech model", e);
                main.post(() -> {
                    setState("error");
                    updateNotification("Hey Bauer couldn’t start — open Studyhall");
                });
            }
        }).start();
    }

    // ---------- Wake word ----------

    private void startSpotting() {
        if (model == null || paused || capturing) return;
        stopSpeech();
        try {
            Recognizer r = new Recognizer(model, 16000.0f, GRAMMAR);
            r.setWords(true);
            speech = new SpeechService(r, 16000.0f);
            speech.startListening(spotter);
            setState("armed");
            updateNotification("Listening for “Hey Bauer”");
        } catch (Exception e) {
            Log.e(TAG, "Microphone unavailable", e);
            setState("error");
            updateNotification("Microphone busy — tap to open Studyhall");
            main.postDelayed(this::startSpotting, 15000); // try again (another app may have had the mic)
        }
    }

    private boolean strong(String t) {
        return t.matches(".*\\b(hey|hi|okay|ok) (bauer|bower)\\b.*");
    }

    private boolean loose(String t) {
        return t.matches(".*(\\b(hey|hi|okay|ok) (power|bauer|bower|our)\\b|\\bbauer\\b).*");
    }

    private final RecognitionListener spotter = new RecognitionListener() {
        @Override
        public void onPartialResult(String hypothesis) {
            String text = field(hypothesis, "partial");
            if (sensitivity >= 50 && (strong(text) || (sensitivity >= 80 && loose(text)))) wake();
        }

        @Override
        public void onResult(String hypothesis) {
            try {
                JSONObject o = new JSONObject(hypothesis);
                String text = o.optString("text", "");
                if (!strong(text) && !(sensitivity >= 65 && loose(text))) return;
                double conf = 0;
                JSONArray words = o.optJSONArray("result");
                if (words != null) for (int i = 0; i < words.length(); i++) {
                    JSONObject w = words.getJSONObject(i);
                    if (w.optString("word").matches("bauer|bower|power|our")) conf = Math.max(conf, w.optDouble("conf", 0));
                }
                if (conf >= 0.95 - sensitivity * 0.005) wake();
            } catch (Exception ignored) {
            }
        }

        @Override
        public void onFinalResult(String hypothesis) {
        }

        @Override
        public void onError(Exception e) {
            Log.e(TAG, "Listening stopped", e);
            main.postDelayed(BauerService.this::startSpotting, 3000);
        }

        @Override
        public void onTimeout() {
        }
    };

    private void wake() {
        long now = System.currentTimeMillis();
        if (now - lastWake < 2500) return;
        lastWake = now;
        main.post(() -> {
            stopSpeech();
            WakeHandler h = wakeHandler;
            boolean taken = false;
            try {
                taken = h != null && h.onWake();
            } catch (Exception ignored) {
            }
            if (taken) {
                paused = true; // the app listens now and says "resume" when it's done
                setState("paused");
            } else startCapture();
        });
    }

    // ---------- Writing down a briefing while Studyhall is closed ----------

    private void startCapture() {
        capturing = true;
        said.setLength(0);
        lastSpeech = 0;
        captureStart = System.currentTimeMillis();
        beep(ToneGenerator.TONE_PROP_ACK);
        setState("listening");
        updateNotification("Listening… tell me what you need");
        try {
            Recognizer r = new Recognizer(model, 16000.0f);
            speech = new SpeechService(r, 16000.0f);
            speech.startListening(new RecognitionListener() {
                @Override
                public void onPartialResult(String h) {
                    if (!field(h, "partial").isEmpty()) lastSpeech = System.currentTimeMillis();
                }

                @Override
                public void onResult(String h) {
                    String t = field(h, "text");
                    if (!t.isEmpty()) {
                        if (said.length() > 0) said.append(". ");
                        said.append(t);
                        lastSpeech = System.currentTimeMillis();
                    }
                }

                @Override
                public void onFinalResult(String h) {
                    onResult(h);
                }

                @Override
                public void onError(Exception e) {
                    finishCapture();
                }

                @Override
                public void onTimeout() {
                    finishCapture();
                }
            });
            main.postDelayed(captureTick, 250);
        } catch (Exception e) {
            capturing = false;
            startSpotting();
        }
    }

    private void finishCapture() {
        if (!capturing) return;
        capturing = false;
        main.removeCallbacks(captureTick);
        if (speech != null) speech.stop(); // the last words arrive shortly through onFinalResult
        main.postDelayed(this::completeCapture, 600);
    }

    private void completeCapture() {
        if (speech != null) {
            speech.shutdown();
            speech = null;
        }
        String text = said.toString().trim();
        if (!text.isEmpty()) {
            savePending(this, text);
            beep(ToneGenerator.TONE_PROP_BEEP2);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTE_HEARD, new NotificationCompat.Builder(this, CHANNEL_HEARD)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Bauer heard you — tap to check")
                .setContentText("“" + text + "”")
                .setStyle(new NotificationCompat.BigTextStyle().bigText("“" + text + "”"))
                .setAutoCancel(true)
                .setContentIntent(openApp("review"))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build());
        } else beep(ToneGenerator.TONE_PROP_NACK);
        startSpotting();
    }

    static void savePending(Context c, String text) {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(p.getString("pending", "[]"));
            JSONObject o = new JSONObject();
            o.put("text", text);
            o.put("at", System.currentTimeMillis());
            a.put(o);
            p.edit().putString("pending", a.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private void beep(int tone) {
        try {
            ToneGenerator g = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70);
            g.startTone(tone, 180);
            main.postDelayed(g::release, 400);
        } catch (Exception ignored) {
        }
    }

    private static String field(String json, String key) {
        try {
            return new JSONObject(json).optString(key, "").trim();
        } catch (Exception e) {
            return "";
        }
    }

    private void stopSpeech() {
        if (speech != null) {
            speech.cancel();
            speech.shutdown();
            speech = null;
        }
    }

    private void stopEverything() {
        capturing = false;
        main.removeCallbacksAndMessages(null);
        stopSpeech();
        running = false;
        setState("off");
        if (model != null) {
            model.close();
            model = null;
        }
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
    }

    @Override
    public void onDestroy() {
        stopEverything();
        super.onDestroy();
    }
}
