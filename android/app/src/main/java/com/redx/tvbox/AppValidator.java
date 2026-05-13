package com.redx.tvbox;

import com.getcapacitor.BridgeActivity;
import com.redx.tvbox.BuildConfig;
import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.Debug;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.ref.WeakReference;
import java.net.ServerSocket;
import java.security.MessageDigest;
import java.util.List;
import java.util.Random;

/**
 * AppValidator — Runtime integrity validation
 * 
 * Proteção completa contra:
 * - APKTool, jadx, dex2jar (decompilação)
 * - Lucky Patcher, MT Manager, Game Guardian (patching)
 * - Frida, Xposed (instrumentação)
 * - Root, Magisk (privilégios elevados)
 * - Emuladores (análise)
 * 
 * IMPORTANTE: Após assinar o APK de release, obter o SHA256:
 *   keytool -printcert -jarfile app-release.apk | grep SHA256
 * E substituir EXPECTED_SIGNATURE abaixo.
 */
public final class AppValidator {

    // ═══════════════════════════════════════════════════════════════
    // ⚠️  AÇÃO OBRIGATÓRIA ANTES DO RELEASE ⚠️
    //
    // Substituir pelo SHA256 real do certificado de assinatura:
    //   keytool -printcert -jarfile app-release.apk | grep SHA256
    // Cole o resultado SEM dois-pontos, em UPPERCASE.
    //
    // ENQUANTO FOR "REPLACE_WITH_YOUR_RELEASE_APK_SHA256":
    //   - verifySignature() sempre retorna false em release
    //   - Se validate() for chamado, o app será terminado em produção
    //   - validate() está comentado em MainActivity.onCreate() por segurança
    // ═══════════════════════════════════════════════════════════════
    private static final String EXPECTED_SIGNATURE = "A6BC2041710036860C6468688FEFC82E839C293900B3A5B62F2AAEAC73037077";
    
    // Package name oficial — impede renomear o pacote
    private static final String EXPECTED_PACKAGE = "com.redx.tvbox";
    
    // Contador de verificações bem-sucedidas (anti-bypass)
    private static volatile int _0x9f8e7d = 0;
    private static final int EXPECTED_CHECK_COUNT = 3;
    
    // Flag para evitar validações repetidas (nome ofuscado para dificultar hook)
    private static volatile int _0x1a2b3c = 0;
    private static boolean isValidated() { return _0x1a2b3c == 0x7F3D; }
    private static void setValidated() { _0x1a2b3c = 0x7F3D; }
    
    // Handler para validação periódica
    private static Handler periodicHandler;
    private static WeakReference<Activity> activityRef;
    private static final long PERIODIC_CHECK_INTERVAL = 60000 + new Random().nextInt(30000); // 60-90s

    private AppValidator() {}

    public static boolean isSignatureConfigured() {
        return EXPECTED_SIGNATURE != null &&
               !EXPECTED_SIGNATURE.trim().isEmpty() &&
               !"REPLACE_WITH_YOUR_RELEASE_APK_SHA256".equals(EXPECTED_SIGNATURE);
    }

    /**
     * Ponto de entrada principal — chamar no MainActivity.onCreate()
     */
    public static void validate(Activity activity) {
        if (activity == null || isValidated()) return;
        setValidated();
        
        // 1. Verificar se é build de debug
        if (isDebugBuild()) {
            // Em debug, não validar (permite desenvolvimento normal)
            return;
        }

        // ═══════════════════════════════════════════════════════════════
        // VERIFICAÇÕES NATIVAS (C++) - Muito mais difíceis de hookear
        // ═══════════════════════════════════════════════════════════════
        
        if (NativeSecurity.isAvailable()) {
            // Verificação completa via código nativo
            int threats = NativeSecurity.safeSecurityCheck();
            
            // 0x01 = Debug
            if ((threats & 0x01) != 0) {
                terminateApp(activity);
                return;
            }
            
            // 0x02, 0x04, 0x08, 0x10 = Frida
            if ((threats & 0x1E) != 0) {
                terminateApp(activity);
                return;
            }
            
            // 0x40 = Emulator
            if ((threats & 0x40) != 0) {
                terminateApp(activity);
                return;
            }
            
            // 0x80 = Inline hooks
            if ((threats & 0x80) != 0) {
                terminateApp(activity);
                return;
            }
            
            // Iniciar watchdog nativo (monitora debug em background)
            NativeSecurity.safeStartWatchdog();
        }

        // ═══════════════════════════════════════════════════════════════
        // VERIFICAÇÕES JAVA (fallback e verificações adicionais)
        // ═══════════════════════════════════════════════════════════════

        // 2. Verificar debugger attachado (Java)
        if (isDebuggerAttached()) {
            terminateApp(activity);
            return;
        }

        // 3. Verificar package name (anti-rebrand)
        if (!verifyPackageName(activity)) {
            terminateApp(activity);
            return;
        }

        // 4. Verificar assinatura do APK (anti-repack)
        if (!verifySignature(activity)) {
            terminateApp(activity);
            return;
        }

        // 5. Detecção de APKTool (anti-recompile)
        if (detectAPKToolModification(activity)) {
            terminateApp(activity);
            return;
        }

        // 6. Detecção de apps de cracking (Lucky Patcher, MT Manager, etc.)
        if (detectCrackingApps(activity)) {
            terminateApp(activity);
            return;
        }

        // 7. Detecção de root/Magisk
        if (detectRoot()) {
            // Opcional: alguns usuários legítimos têm root
            // Descomentar se quiser bloquear root:
            // terminateApp(activity);
            // return;
        }

        // 8. Detecção de emulador (análise) - Java fallback
        if (detectEmulator()) {
            terminateApp(activity);
            return;
        }

        // 9. Detecção de Frida/Xposed (Java) - fallback se nativo não disponível
        if (detectInstrumentation()) {
            terminateApp(activity);
        }        
        // 10. Iniciar validação periódica em background
        startPeriodicValidation(activity);
    }
    
    /**
     * Validação periódica em background (detecta hooks aplicados após onCreate)
     */
    private static void startPeriodicValidation(Activity activity) {
        if (periodicHandler != null) return; // Já iniciado
        
        activityRef = new WeakReference<>(activity);
        periodicHandler = new Handler(Looper.getMainLooper());
        
        Runnable periodicCheck = new Runnable() {
            @Override
            public void run() {
                Activity act = activityRef != null ? activityRef.get() : null;
                if (act == null || act.isFinishing() || act.isDestroyed()) {
                    stopPeriodicValidation();
                    return;
                }
                
                // ════════════════════════════════════════════════════════
                // VERIFICAÇÕES NATIVAS PERIÓDICAS (mais seguras)
                // ════════════════════════════════════════════════════════
                if (NativeSecurity.isAvailable()) {
                    // Debug nativo (ptrace, TracerPid)
                    if (NativeSecurity.safeDebugCheck()) {
                        terminateApp(act);
                        return;
                    }
                    
                    // Frida nativo (ports, threads, libs, files)
                    if (NativeSecurity.safeFridaCheck()) {
                        terminateApp(act);
                        return;
                    }
                }
                
                // ════════════════════════════════════════════════════════
                // VERIFICAÇÕES JAVA (fallback)
                // ════════════════════════════════════════════════════════
                
                // Verificar debugger (pode ser attachado após onCreate)
                if (isDebuggerAttached()) {
                    terminateApp(act);
                    return;
                }
                
                // Verificar Frida (pode ser injetado após onCreate)
                if (detectInstrumentation()) {
                    terminateApp(act);
                    return;
                }
                
                // Verificar se assinatura ainda é válida
                if (!verifySignature(act)) {
                    terminateApp(act);
                    return;
                }
                
                // Agendar próxima verificação com intervalo aleatório
                long nextInterval = 60000 + new Random().nextInt(30000);
                periodicHandler.postDelayed(this, nextInterval);
            }
        };
        
        // Primeira verificação após intervalo inicial
        periodicHandler.postDelayed(periodicCheck, PERIODIC_CHECK_INTERVAL);
    }
    
    /**
     * Parar validação periódica (chamar em onDestroy se necessário)
     */
    public static void stopPeriodicValidation() {
        if (periodicHandler != null) {
            periodicHandler.removeCallbacksAndMessages(null);
            periodicHandler = null;
        }
        activityRef = null;    }

    // ─────────────────────────────────────────────────────────────────
    // DEBUG CHECKS
    // ─────────────────────────────────────────────────────────────────

    private static boolean isDebugBuild() {
        return BuildConfig.DEBUG;
    }

    private static boolean isDebuggerAttached() {
        return Debug.isDebuggerConnected() || Debug.waitingForDebugger();
    }

    // ─────────────────────────────────────────────────────────────────
    // CRACKING APPS DETECTION (Lucky Patcher, MT Manager, etc.)
    // ─────────────────────────────────────────────────────────────────

    private static boolean detectCrackingApps(Context context) {
        // Lista de apps conhecidos usados para cracking
        String[] dangerousPackages = {
            // Lucky Patcher e variantes
            "com.chelpus.lackypatch",
            "com.dimonvideo.luckypatcher",
            "com.chelpus.luckypatcher",
            "com.android.vending.billing.InAppBillingService.LUCK",
            "com.android.vending.billing.InAppBillingService.LACK",
            
            // MT Manager / APK Editor
            "bin.mt.plus",
            "bin.mt.plus.canary",
            "com.gmail.heagoo.apkeditor",
            "com.gmail.heagoo.apkeditor.pro",
            
            // NP Manager
            "com.shizuku.npmanager",
            
            // Game Guardian / Memory Editors
            "com.gameguardian",
            "catch_.me_.if_.you_.can_",
            "com.github.nicehack.crazyhacker",
            
            // Freedom (IAP hack)
            "jase.freedom",
            "madkite.freedom",
            
            // CreeHack
            "com.baseappfull.fwd",
            "org.creeplays.hack",
            
            // Leo Playcard
            "com.leo.playcard",
            
            // App Cloners (podem ser usados para bypass)
            "com.applisto.appcloner",
            "com.dualspace.dual",
            "com.ludashi.dualspace",
            "com.excelliance.multiaccounts",
            "com.parallel.space.lite",
            
            // Xposed Installer
            "de.robv.android.xposed.installer",
            "org.meowcat.edxposed.manager",
            "org.lsposed.manager",
            
            // Magisk Manager
            "com.topjohnwu.magisk",
            
            // Virtual Xposed
            "io.va.exposed",
            
            // Substrate
            "com.saurik.substrate"
        };

        PackageManager pm = context.getPackageManager();
        for (String pkg : dangerousPackages) {
            try {
                pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES);
                return true; // App perigoso encontrado
            } catch (PackageManager.NameNotFoundException e) {
                // Não encontrado, continua verificando
            }
        }

        // Verificar também por apps com nomes suspeitos instalados
        try {
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            for (ApplicationInfo app : apps) {
                String pkgName = app.packageName.toLowerCase();
                if (pkgName.contains("lucky") && pkgName.contains("patch")) return true;
                if (pkgName.contains("game") && pkgName.contains("guardian")) return true;
                if (pkgName.contains("game") && pkgName.contains("hack")) return true;
                if (pkgName.contains("cheat")) return true;
                if (pkgName.contains("crack") && !pkgName.contains("cracker")) return true;
            }
        } catch (Exception ignored) {}

        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // ROOT / MAGISK DETECTION
    // ─────────────────────────────────────────────────────────────────

    private static boolean detectRoot() {
        // 1. Verificar binários de root comuns
        String[] rootPaths = {
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su",
            "/system/xbin/busybox",
            "/sbin/magisk",
            "/system/bin/magisk"
        };

        for (String path : rootPaths) {
            if (new File(path).exists()) {
                return true;
            }
        }

        // 2. Verificar se consegue executar su
        try {
            Process process = Runtime.getRuntime().exec(new String[]{"which", "su"});
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            if (reader.readLine() != null) {
                reader.close();
                return true;
            }
            reader.close();
        } catch (Exception ignored) {}

        // 3. Verificar props de build suspeitas
        String buildTags = Build.TAGS;
        if (buildTags != null && buildTags.contains("test-keys")) {
            return true;
        }

        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // EMULATOR DETECTION
    // ─────────────────────────────────────────────────────────────────

    private static boolean detectEmulator() {
        // 1. Verificar propriedades de build
        if (Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.MODEL.contains("google_sdk") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for x86") ||
            Build.MANUFACTURER.contains("Genymotion") ||
            Build.BRAND.startsWith("generic") ||
            Build.DEVICE.startsWith("generic") ||
            Build.PRODUCT.contains("sdk") ||
            Build.PRODUCT.contains("vbox") ||
            Build.PRODUCT.contains("emulator") ||
            Build.HARDWARE.contains("goldfish") ||
            Build.HARDWARE.contains("ranchu")) {
            return true;
        }

        // 2. Verificar arquivos de emulador
        String[] emulatorFiles = {
            "/dev/socket/qemud",
            "/dev/qemu_pipe",
            "/system/lib/libc_malloc_debug_qemu.so",
            "/sys/qemu_trace",
            "/system/bin/qemu-props",
            "/dev/socket/genyd",
            "/dev/socket/baseband_genyd"
        };

        for (String file : emulatorFiles) {
            if (new File(file).exists()) {
                return true;
            }
        }

        // 3. Verificar operador de telefonia (emuladores geralmente não têm)
        // Nota: TV Box legítima também pode não ter, então só verificar
        // se for combinado com outras flags

        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // PACKAGE NAME VERIFICATION (ANTI-REBRAND)
    // ─────────────────────────────────────────────────────────────────

    private static boolean verifyPackageName(Context context) {
        String currentPackage = context.getPackageName();
        return EXPECTED_PACKAGE.equals(currentPackage);
    }

    // ─────────────────────────────────────────────────────────────────
    // APKTOOL DETECTION (ANTI-RECOMPILE)
    // ─────────────────────────────────────────────────────────────────

    private static boolean detectAPKToolModification(Context context) {
        // 1. Verificar se apktool.yml existe (deixado após recompilação)
        if (checkAPKToolFiles(context)) {
            return true;
        }

        // 2. Verificar integridade do META-INF (APKTool altera)
        if (checkMetaInfTampering(context)) {
            return true;
        }

        // 3. Verificar classes.dex modificado via timestamp anômalo
        if (checkDexTimestamp(context)) {
            return true;
        }

        // 4. Verificar se resources.arsc foi modificado
        if (checkResourcesTampering(context)) {
            return true;
        }

        return false;
    }

    private static boolean checkAPKToolFiles(Context context) {
        try {
            // APKTool deixa rastros no APK recompilado
            AssetManager assets = context.getAssets();
            String[] files = assets.list("");
            if (files != null) {
                for (String file : files) {
                    String lower = file.toLowerCase();
                    // Arquivos que indicam recompilação via APKTool
                    if (lower.contains("apktool") || 
                        lower.equals("original") ||
                        lower.contains("smali")) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        
        // Verificar no filesystem também
        String[] suspiciousPaths = {
            context.getApplicationInfo().sourceDir.replace(".apk", "") + "/apktool.yml",
            "/data/local/tmp/apktool",
            context.getFilesDir() + "/apktool.yml"
        };
        for (String path : suspiciousPaths) {
            if (new File(path).exists()) {
                return true;
            }
        }
        
        return false;
    }

    private static boolean checkMetaInfTampering(Context context) {
        try {
            // APKTool geralmente altera ou remove arquivos META-INF
            // Verificar se CERT.RSA/CERT.SF existem (APKTool pode remover)
            java.util.zip.ZipFile apk = new java.util.zip.ZipFile(
                context.getApplicationInfo().sourceDir
            );
            
            boolean hasCertRSA = apk.getEntry("META-INF/CERT.RSA") != null ||
                                 apk.getEntry("META-INF/CERT.SF") != null;
            
            // Verificar se há arquivos .SF e .RSA (assinatura)
            java.util.Enumeration<? extends java.util.zip.ZipEntry> entries = apk.entries();
            int sigFileCount = 0;
            while (entries.hasMoreElements()) {
                String name = entries.nextElement().getName();
                if (name.startsWith("META-INF/") && 
                    (name.endsWith(".SF") || name.endsWith(".RSA") || name.endsWith(".DSA"))) {
                    sigFileCount++;
                }
            }
            apk.close();
            
            // APK legítimo deve ter pelo menos 2 arquivos de assinatura
            if (sigFileCount < 2) {
                return true;
            }
            
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean checkDexTimestamp(Context context) {
        try {
            // APKTool recompilado geralmente tem timestamps de 1980 (padrão ZIP)
            java.util.zip.ZipFile apk = new java.util.zip.ZipFile(
                context.getApplicationInfo().sourceDir
            );
            
            java.util.zip.ZipEntry dex = apk.getEntry("classes.dex");
            if (dex != null) {
                long dexTime = dex.getTime();
                
                // Timestamp de 1980-01-01 00:00:00 em ms = 315532800000
                // APKTool usa esse timestamp padrão do DOS/ZIP
                // Se DEX tem timestamp muito próximo de 1980 = suspeito
                long dosEpoch = 315532800000L;
                long tolerance = 86400000L; // 1 dia de tolerância
                
                if (Math.abs(dexTime - dosEpoch) < tolerance) {
                    apk.close();
                    return true; // Timestamp padrão do APKTool detectado
                }
                
                // Se timestamp é de antes de 2020 (improvável para app novo)
                long year2020 = 1577836800000L; // 2020-01-01
                if (dexTime < year2020) {
                    apk.close();
                    return true; // Timestamp suspeito (muito antigo)
                }
            }
            apk.close();
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean checkResourcesTampering(Context context) {
        try {
            // Verificar se recursos críticos existem e não foram removidos
            // APKTool às vezes falha em recompilar recursos corretamente
            
            int appIconId = context.getApplicationInfo().icon;
            if (appIconId == 0) {
                return true; // Ícone removido = modificado
            }
            
            // Verificar se o app name ainda é o esperado
            int labelId = context.getApplicationInfo().labelRes;
            if (labelId != 0) {
                String label = context.getString(labelId);
                // Se o nome foi alterado para algo que não contém "RedX" ou "REDX"
                if (label != null && !label.toLowerCase().contains("red")) {
                    return true;
                }
            }
            
        } catch (Exception ignored) {}
        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // SIGNATURE VERIFICATION (ANTI-REPACK)
    // ─────────────────────────────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private static boolean verifySignature(Context context) {
        // ═══════════════════════════════════════════════════════════════
        // FAIL CLOSED: Se SHA256 não configurado, app NÃO funciona.
        // Isso força configuração correta antes do release.
        // NÃO há bypass. NÃO há fallback.
        // ═══════════════════════════════════════════════════════════════
        
        try {
            PackageInfo packageInfo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo = context.getPackageManager().getPackageInfo(
                    context.getPackageName(),
                    PackageManager.GET_SIGNING_CERTIFICATES
                );
                if (packageInfo.signingInfo != null) {
                    Signature[] signatures = packageInfo.signingInfo.getApkContentsSigners();
                    for (Signature sig : signatures) {
                        String hash = getSHA256(sig.toByteArray());
                        if (EXPECTED_SIGNATURE.equalsIgnoreCase(hash)) {
                            return true;
                        }
                    }
                }
            } else {
                packageInfo = context.getPackageManager().getPackageInfo(
                    context.getPackageName(),
                    PackageManager.GET_SIGNATURES
                );
                if (packageInfo.signatures != null) {
                    for (Signature sig : packageInfo.signatures) {
                        String hash = getSHA256(sig.toByteArray());
                        if (EXPECTED_SIGNATURE.equalsIgnoreCase(hash)) {
                            return true;
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Fail closed — se erro, considera inválido
        }
        return false;
    }

    private static String getSHA256(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02X", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // INSTRUMENTATION DETECTION (FRIDA/XPOSED AVANÇADO)
    // ─────────────────────────────────────────────────────────────────

    private static boolean detectInstrumentation() {
        // 1. Verificar range de portas do Frida (pode usar qualquer porta 27000-27100)
        if (detectFridaPorts()) {
            return true;
        }

        // 2. Verificar arquivos conhecidos do Frida/Xposed
        if (detectFridaFiles()) {
            return true;
        }

        // 3. Verificar /proc/self/maps por bibliotecas injetadas
        if (detectInjectedLibraries()) {
            return true;
        }

        // 4. Verificar threads do Frida agent
        if (detectFridaThreads()) {
            return true;
        }

        // 5. Verificar se app está sendo traced (ptrace)
        if (detectPtrace()) {
            return true;
        }

        // 6. Verificar stack trace para Xposed
        if (detectXposedStack()) {
            return true;
        }

        // 7. Verificar processos suspeitos
        return checkSuspiciousProcesses();
    }

    private static boolean detectFridaPorts() {
        // Frida pode usar portas 27000-27100
        int[] commonPorts = {27042, 27043, 27044, 27045, 27047, 27000, 27050};
        for (int port : commonPorts) {
            if (isPortInUse(port)) {
                return true;
            }
        }
        return false;
    }

    private static boolean detectFridaFiles() {
        String[] suspiciousPaths = {
            "/data/local/tmp/frida-server",
            "/data/local/tmp/re.frida.server",
            "/data/local/tmp/frida",
            "/data/local/tmp/frida-agent",
            "/data/local/tmp/frida-gadget",
            "/system/lib/libfrida-gadget.so",
            "/system/lib64/libfrida-gadget.so",
            "/system/xbin/frida-server",
            "/system/bin/frida-server",
            "/vendor/lib/libfrida-gadget.so",
            "/vendor/lib64/libfrida-gadget.so",
            "/data/data/de.robv.android.xposed.installer",
            "/data/data/io.va.exposed",
            "/data/data/org.meowcat.edxposed.manager",
            "/data/data/org.lsposed.manager"
        };
        for (String path : suspiciousPaths) {
            if (new File(path).exists()) {
                return true;
            }
        }
        return false;
    }

    private static boolean detectInjectedLibraries() {
        // Verifica /proc/self/maps por bibliotecas suspeitas
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(
                new java.io.FileInputStream("/proc/self/maps")));
            String line;
            while ((line = reader.readLine()) != null) {
                String lower = line.toLowerCase();
                if (lower.contains("frida") ||
                    lower.contains("gadget") ||
                    lower.contains("substrate") ||
                    lower.contains("xposed") ||
                    lower.contains("lsposed") ||
                    lower.contains("edxposed") ||
                    lower.contains("/data/local/tmp/") && lower.contains(".so")) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (Exception ignored) {}
            }
        }
        return false;
    }

    private static boolean detectFridaThreads() {
        // Frida cria threads com nomes específicos
        String[] suspiciousThreads = {
            "gum-js-loop",
            "gmain",
            "gdbus",
            "pool-frida",
            "frida-helper",
            "linjector"
        };
        
        try {
            File taskDir = new File("/proc/self/task");
            if (taskDir.exists() && taskDir.isDirectory()) {
                File[] tasks = taskDir.listFiles();
                if (tasks != null) {
                    for (File task : tasks) {
                        File commFile = new File(task, "comm");
                        if (commFile.exists()) {
                            BufferedReader reader = null;
                            try {
                                reader = new BufferedReader(new InputStreamReader(
                                    new java.io.FileInputStream(commFile)));
                                String threadName = reader.readLine();
                                if (threadName != null) {
                                    String lower = threadName.toLowerCase();
                                    for (String suspicious : suspiciousThreads) {
                                        if (lower.contains(suspicious)) {
                                            return true;
                                        }
                                    }
                                }
                            } finally {
                                if (reader != null) {
                                    try { reader.close(); } catch (Exception ignored) {}
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean detectPtrace() {
        // Verifica se estamos sendo traced (debugger/Frida attach)
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(
                new java.io.FileInputStream("/proc/self/status")));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("TracerPid:")) {
                    String tracerPid = line.substring(10).trim();
                    if (!tracerPid.equals("0")) {
                        return true; // Alguém está nos tracing
                    }
                    break;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (Exception ignored) {}
            }
        }
        return false;
    }

    private static boolean detectXposedStack() {
        try {
            throw new RuntimeException("Anti-hook stack check");
        } catch (RuntimeException e) {
            for (StackTraceElement element : e.getStackTrace()) {
                String className = element.getClassName().toLowerCase();
                String methodName = element.getMethodName().toLowerCase();
                if (className.contains("xposed") || 
                    className.contains("substrate") ||
                    className.contains("lsposed") ||
                    className.contains("edxposed") ||
                    methodName.contains("handleloadpackage") ||
                    methodName.contains("handleinitpackageresources")) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean isPortInUse(int port) {
        ServerSocket socket = null;
        try {
            socket = new ServerSocket(port);
            socket.close();
            return false; // Porta disponível = Frida não está rodando
        } catch (Exception e) {
            return true; // Porta em uso
        } finally {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

    private static boolean checkSuspiciousProcesses() {
        BufferedReader reader = null;
        try {
            Process process = Runtime.getRuntime().exec("ps");
            reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                String lower = line.toLowerCase();
                if (lower.contains("frida") || lower.contains("xposed") || 
                    lower.contains("magisk") || lower.contains("substrate")) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (Exception ignored) {}
            }
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // VERIFICAÇÃO SECUNDÁRIA (nome ofuscado pelo R8)
    // Chamado de múltiplos pontos para dificultar bypass
    // ─────────────────────────────────────────────────────────────────

    /**
     * Verificação rápida secundária - chamar em pontos críticos
     * Nome será ofuscado para algo como "a()" ou "b()"
     */
    public static void c(Context ctx) {
        if (ctx == null) return;
        if (isDebugBuild()) return;
        
        // Incrementar contador de verificações
        _0x9f8e7d++;
        
        // Verificar assinatura (crítico)
        if (!verifySignature(ctx)) {
            if (ctx instanceof Activity) {
                terminateApp((Activity) ctx);
            } else {
                android.os.Process.killProcess(android.os.Process.myPid());
            }
        }
    }

    /**
     * Verificação de integridade - verifica se validações rodaram
     * Se o atacante removeu chamadas, o contador estará errado
     */
    public static boolean i(int expected) {
        return _0x9f8e7d >= expected;
    }

    /**
     * Verificação com delay - dificulta análise dinâmica
     */
    public static void d(final Context ctx, long delayMs) {
        if (ctx == null) return;
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                c(ctx);
            }
        }, delayMs);
    }

    // ─────────────────────────────────────────────────────────────────
    // TERMINATION — Encerrar app de forma limpa
    // ─────────────────────────────────────────────────────────────────

    private static void terminateApp(Activity activity) {
        try {
            activity.finishAffinity();
        } catch (Exception ignored) {}
        
        // Delay mínimo para garantir que finishAffinity execute
        try { Thread.sleep(100); } catch (Exception ignored) {}
        
        android.os.Process.killProcess(android.os.Process.myPid());
        System.exit(0);
    }
}
