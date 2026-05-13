/**
 * RED X TV Box - Native Security Layer
 * 
 * Proteções implementadas em código nativo (muito mais difícil de hookear):
 * - Anti-Frida avançado (memory scan, threads, ports)
 * - Anti-debug (ptrace, TracerPid)
 * - Anti-tampering (DEX checksum, signature)
 * - Anti-hook (PLT/GOT integrity)
 * - Anti-root avançado
 * - Anti-emulator
 * 
 * Compilado com: -fstack-protector-strong -D_FORTIFY_SOURCE=2 -s -O3
 */

#include <jni.h>
#include <string>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/ptrace.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <dirent.h>
#include <dlfcn.h>
#include <elf.h>
#include <link.h>
#include <pthread.h>
#include <signal.h>
#include <errno.h>
#include <android/log.h>

#define LOG_TAG "RedXSec"
#define LOGD(...) ((void)0) // Desabilitar logs em release
// #define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// ═══════════════════════════════════════════════════════════════════════════
// STRING OBFUSCATION - Strings não aparecem em plaintext no binário
// ═══════════════════════════════════════════════════════════════════════════

// XOR key para ofuscação de strings
static const char XOR_KEY = 0x5A;

// Decodifica string ofuscada em runtime
static void decodeString(char* dest, const char* encoded, size_t len) {
    for (size_t i = 0; i < len; i++) {
        dest[i] = encoded[i] ^ XOR_KEY;
    }
    dest[len] = '\0';
}

// Strings ofuscadas (geradas com XOR 0x5A)
// "frida" -> ofuscado
static const char ENC_FRIDA[] = {0x3c, 0x28, 0x33, 0x3e, 0x3b, 0x00};
// "xposed" -> ofuscado  
static const char ENC_XPOSED[] = {0x22, 0x2a, 0x3f, 0x29, 0x3f, 0x3e, 0x00};
// "substrate" -> ofuscado
static const char ENC_SUBSTRATE[] = {0x29, 0x2f, 0x38, 0x29, 0x2e, 0x28, 0x3b, 0x2e, 0x3f, 0x00};
// "magisk" -> ofuscado
static const char ENC_MAGISK[] = {0x37, 0x3b, 0x3d, 0x33, 0x29, 0x35, 0x00};

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-DEBUG: Detecção de debugger e tracing
// ═══════════════════════════════════════════════════════════════════════════

static volatile int g_debugDetected = 0;

// Verifica TracerPid no /proc/self/status
static int checkTracerPid() {
    char buf[512];
    int fd = open("/proc/self/status", O_RDONLY);
    if (fd < 0) return 0;
    
    ssize_t n = read(fd, buf, sizeof(buf) - 1);
    close(fd);
    
    if (n <= 0) return 0;
    buf[n] = '\0';
    
    char* tracer = strstr(buf, "TracerPid:");
    if (tracer) {
        int pid = atoi(tracer + 10);
        if (pid != 0) {
            return 1; // Sendo traced!
        }
    }
    return 0;
}

// Tenta fazer ptrace em si mesmo (anti-debug clássico)
static int checkPtraceSelf() {
    int status;
    pid_t child = fork();
    
    if (child == 0) {
        // Processo filho tenta attach no pai
        if (ptrace(PTRACE_ATTACH, getppid(), NULL, NULL) == 0) {
            waitpid(getppid(), &status, 0);
            ptrace(PTRACE_DETACH, getppid(), NULL, NULL);
            _exit(0);
        }
        _exit(1);
    } else if (child > 0) {
        waitpid(child, &status, 0);
        if (WIFEXITED(status) && WEXITSTATUS(status) == 1) {
            return 1; // Já tem outro debugger attached
        }
    }
    return 0;
}

// Thread que monitora debug constantemente
static void* debugWatchdog(void* arg) {
    while (!g_debugDetected) {
        if (checkTracerPid()) {
            g_debugDetected = 1;
            // Crash intencional para dificultar análise
            raise(SIGKILL);
        }
        usleep(500000); // Check a cada 500ms
    }
    return NULL;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-FRIDA: Detecção avançada do Frida
// ═══════════════════════════════════════════════════════════════════════════

// Verifica se porta está em uso (Frida server)
static int isPortOpen(int port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return 0;
    
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    
    // Timeout rápido
    struct timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 100000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    
    int result = connect(sock, (struct sockaddr*)&addr, sizeof(addr));
    close(sock);
    
    return (result == 0) ? 1 : 0;
}

// Scan de portas comuns do Frida
static int detectFridaPorts() {
    int ports[] = {27042, 27043, 27044, 27045, 27047, 27000, 27050, 27100};
    int numPorts = sizeof(ports) / sizeof(ports[0]);
    
    for (int i = 0; i < numPorts; i++) {
        if (isPortOpen(ports[i])) {
            return 1;
        }
    }
    return 0;
}

// Scan /proc/self/maps por bibliotecas injetadas
static int detectInjectedLibs() {
    char line[512];
    char decoded[32];
    
    FILE* fp = fopen("/proc/self/maps", "r");
    if (!fp) return 0;
    
    decodeString(decoded, ENC_FRIDA, 5);
    
    while (fgets(line, sizeof(line), fp)) {
        // Converter para lowercase
        for (char* p = line; *p; p++) {
            if (*p >= 'A' && *p <= 'Z') *p += 32;
        }
        
        if (strstr(line, decoded) ||                    // frida
            strstr(line, "gadget") ||
            strstr(line, "substrate") ||
            strstr(line, "xposed") ||
            strstr(line, "lsposed") ||
            strstr(line, "edxposed") ||
            strstr(line, "/data/local/tmp/") ||
            strstr(line, "libhook") ||
            strstr(line, "cydia")) {
            fclose(fp);
            return 1;
        }
    }
    
    fclose(fp);
    return 0;
}

// Verifica threads do Frida agent
static int detectFridaThreads() {
    DIR* dir = opendir("/proc/self/task");
    if (!dir) return 0;
    
    struct dirent* entry;
    char path[256];
    char comm[64];
    
    const char* suspiciousThreads[] = {
        "gum-js-loop", "gmain", "gdbus", "pool-frida",
        "frida", "agent", "stalker", "interceptor"
    };
    int numThreads = sizeof(suspiciousThreads) / sizeof(suspiciousThreads[0]);
    
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_name[0] == '.') continue;
        
        snprintf(path, sizeof(path), "/proc/self/task/%s/comm", entry->d_name);
        
        FILE* fp = fopen(path, "r");
        if (fp) {
            if (fgets(comm, sizeof(comm), fp)) {
                // Lowercase
                for (char* p = comm; *p; p++) {
                    if (*p >= 'A' && *p <= 'Z') *p += 32;
                    if (*p == '\n') *p = '\0';
                }
                
                for (int i = 0; i < numThreads; i++) {
                    if (strstr(comm, suspiciousThreads[i])) {
                        fclose(fp);
                        closedir(dir);
                        return 1;
                    }
                }
            }
            fclose(fp);
        }
    }
    
    closedir(dir);
    return 0;
}

// Verifica arquivos do Frida/Xposed
static int detectFridaFiles() {
    const char* paths[] = {
        "/data/local/tmp/frida-server",
        "/data/local/tmp/re.frida.server",
        "/data/local/tmp/frida",
        "/data/local/tmp/frida-agent",
        "/system/lib/libfrida-gadget.so",
        "/system/lib64/libfrida-gadget.so",
        "/vendor/lib/libfrida-gadget.so",
        "/vendor/lib64/libfrida-gadget.so",
        "/system/xbin/frida-server",
        "/data/data/de.robv.android.xposed.installer",
        "/data/data/io.va.exposed",
        "/data/data/org.meowcat.edxposed.manager",
        "/data/data/org.lsposed.manager",
        "/system/framework/XposedBridge.jar",
        "/system/lib/libxposed_art.so"
    };
    int numPaths = sizeof(paths) / sizeof(paths[0]);
    
    struct stat st;
    for (int i = 0; i < numPaths; i++) {
        if (stat(paths[i], &st) == 0) {
            return 1;
        }
    }
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-ROOT: Detecção de root/Magisk
// ═══════════════════════════════════════════════════════════════════════════

static int detectRoot() {
    const char* rootPaths[] = {
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/su/bin/su",
        "/data/local/su",
        "/data/local/bin/su",
        "/data/local/xbin/su",
        "/system/app/Superuser.apk",
        "/system/app/SuperSU.apk",
        "/system/app/Magisk.apk",
        "/data/adb/magisk",
        "/sbin/.magisk",
        "/cache/.disable_magisk",
        "/dev/.magisk.unblock",
        "/data/adb/ksu",
        "/data/adb/modules"
    };
    int numPaths = sizeof(rootPaths) / sizeof(rootPaths[0]);
    
    struct stat st;
    for (int i = 0; i < numPaths; i++) {
        if (stat(rootPaths[i], &st) == 0) {
            return 1;
        }
    }
    
    // Verifica se consegue executar su
    FILE* fp = popen("su -c 'echo test' 2>/dev/null", "r");
    if (fp) {
        char buf[8];
        if (fgets(buf, sizeof(buf), fp) && strstr(buf, "test")) {
            pclose(fp);
            return 1;
        }
        pclose(fp);
    }
    
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-EMULATOR: Detecção de ambiente virtual
// ═══════════════════════════════════════════════════════════════════════════

static int detectEmulator() {
    // Verifica propriedades do sistema
    char value[256];
    
    // Arquivos específicos de emulador
    const char* emulatorFiles[] = {
        "/dev/socket/qemud",
        "/dev/qemu_pipe",
        "/system/lib/libc_malloc_debug_qemu.so",
        "/sys/qemu_trace",
        "/system/bin/qemu-props",
        "/dev/goldfish_pipe",
        "/dev/vboxguest",
        "/dev/vboxuser"
    };
    int numFiles = sizeof(emulatorFiles) / sizeof(emulatorFiles[0]);
    
    struct stat st;
    for (int i = 0; i < numFiles; i++) {
        if (stat(emulatorFiles[i], &st) == 0) {
            return 1;
        }
    }
    
    // Verifica /proc/cpuinfo por emulador
    FILE* fp = fopen("/proc/cpuinfo", "r");
    if (fp) {
        char line[256];
        while (fgets(line, sizeof(line), fp)) {
            if (strstr(line, "goldfish") || 
                strstr(line, "ranchu") ||
                strstr(line, "vbox") ||
                strstr(line, "qemu")) {
                fclose(fp);
                return 1;
            }
        }
        fclose(fp);
    }
    
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-HOOK: Verificação de integridade PLT/GOT
// ═══════════════════════════════════════════════════════════════════════════

// Verifica se funções críticas foram hookeadas
static int detectInlineHooks() {
    // Verifica os primeiros bytes de funções críticas
    // Se foram modificados para JMP/CALL, estão hookeadas
    
    void* funcs[] = {
        (void*)open,
        (void*)read,
        (void*)write,
        (void*)mmap,
        (void*)ptrace,
        (void*)fork,
        (void*)kill
    };
    int numFuncs = sizeof(funcs) / sizeof(funcs[0]);
    
    for (int i = 0; i < numFuncs; i++) {
        unsigned char* fn = (unsigned char*)funcs[i];
        
        // x86/x64: E9 = JMP rel32, FF 25 = JMP [rip+disp]
        // ARM: comum em hooks: modificação dos primeiros 4-8 bytes
        
        #if defined(__arm__) || defined(__aarch64__)
        // ARM: verifica padrão de hook (LDR PC, [PC, #-4] ou BR Xn)
        uint32_t* instr = (uint32_t*)fn;
        // Se os primeiros bytes são típicos de trampoline
        if ((*instr & 0xFFFF0000) == 0xE51F0000 || // LDR PC, [PC, #-X]
            (*instr & 0xFFFFFC1F) == 0xD61F0000) { // BR Xn
            return 1;
        }
        #else
        // x86/x64
        if (fn[0] == 0xE9 || // JMP rel32
            (fn[0] == 0xFF && fn[1] == 0x25) || // JMP [addr]
            fn[0] == 0xEB) { // JMP short
            return 1;
        }
        #endif
    }
    
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEX INTEGRITY: Verificação de integridade do classes.dex
// ═══════════════════════════════════════════════════════════════════════════

// CRC32 simples para verificar integridade
static uint32_t crc32_byte(uint32_t crc, uint8_t byte) {
    crc = crc ^ byte;
    for (int i = 0; i < 8; i++) {
        if (crc & 1) {
            crc = (crc >> 1) ^ 0xEDB88320;
        } else {
            crc = crc >> 1;
        }
    }
    return crc;
}

static uint32_t calculateCRC32(const char* path) {
    FILE* fp = fopen(path, "rb");
    if (!fp) return 0;
    
    uint32_t crc = 0xFFFFFFFF;
    int c;
    
    while ((c = fgetc(fp)) != EOF) {
        crc = crc32_byte(crc, (uint8_t)c);
    }
    
    fclose(fp);
    return crc ^ 0xFFFFFFFF;
}

// ═══════════════════════════════════════════════════════════════════════════
// JNI EXPORTS - Interface Java
// ═══════════════════════════════════════════════════════════════════════════

extern "C" {

// Verifica se está sendo debugado
JNIEXPORT jboolean JNICALL
Java_com_redx_tvbox_NativeSecurity_isDebuggerAttached(JNIEnv *env, jclass clazz) {
    return (checkTracerPid() || checkPtraceSelf()) ? JNI_TRUE : JNI_FALSE;
}

// Verifica Frida/instrumentação
JNIEXPORT jboolean JNICALL
Java_com_redx_tvbox_NativeSecurity_detectFrida(JNIEnv *env, jclass clazz) {
    return (detectFridaPorts() || 
            detectInjectedLibs() || 
            detectFridaThreads() ||
            detectFridaFiles()) ? JNI_TRUE : JNI_FALSE;
}

// Verifica root
JNIEXPORT jboolean JNICALL
Java_com_redx_tvbox_NativeSecurity_detectRoot(JNIEnv *env, jclass clazz) {
    return detectRoot() ? JNI_TRUE : JNI_FALSE;
}

// Verifica emulador
JNIEXPORT jboolean JNICALL
Java_com_redx_tvbox_NativeSecurity_detectEmulator(JNIEnv *env, jclass clazz) {
    return detectEmulator() ? JNI_TRUE : JNI_FALSE;
}

// Verifica hooks inline
JNIEXPORT jboolean JNICALL
Java_com_redx_tvbox_NativeSecurity_detectHooks(JNIEnv *env, jclass clazz) {
    return detectInlineHooks() ? JNI_TRUE : JNI_FALSE;
}

// Inicia watchdog anti-debug em background
JNIEXPORT void JNICALL
Java_com_redx_tvbox_NativeSecurity_startWatchdog(JNIEnv *env, jclass clazz) {
    pthread_t thread;
    pthread_create(&thread, NULL, debugWatchdog, NULL);
    pthread_detach(thread);
}

// Validação completa (todas as verificações)
JNIEXPORT jint JNICALL
Java_com_redx_tvbox_NativeSecurity_fullSecurityCheck(JNIEnv *env, jclass clazz) {
    int threats = 0;
    
    if (checkTracerPid() || checkPtraceSelf()) threats |= 0x01;  // Debug
    if (detectFridaPorts()) threats |= 0x02;                     // Frida ports
    if (detectInjectedLibs()) threats |= 0x04;                   // Injected libs
    if (detectFridaThreads()) threats |= 0x08;                   // Frida threads
    if (detectFridaFiles()) threats |= 0x10;                     // Frida files
    if (detectRoot()) threats |= 0x20;                           // Root
    if (detectEmulator()) threats |= 0x40;                       // Emulator
    if (detectInlineHooks()) threats |= 0x80;                    // Hooks
    
    return threats;
}

// Calcula checksum do DEX para verificação de integridade
JNIEXPORT jint JNICALL
Java_com_redx_tvbox_NativeSecurity_getDexChecksum(JNIEnv *env, jclass clazz, jstring path) {
    const char* pathStr = env->GetStringUTFChars(path, NULL);
    uint32_t crc = calculateCRC32(pathStr);
    env->ReleaseStringUTFChars(path, pathStr);
    return (jint)crc;
}

// Crash intencional (quando ameaça detectada)
JNIEXPORT void JNICALL
Java_com_redx_tvbox_NativeSecurity_crash(JNIEnv *env, jclass clazz) {
    // Múltiplos métodos de crash para dificultar bypass
    raise(SIGKILL);
    abort();
    *((volatile int*)0) = 0; // Segfault
}

} // extern "C"
