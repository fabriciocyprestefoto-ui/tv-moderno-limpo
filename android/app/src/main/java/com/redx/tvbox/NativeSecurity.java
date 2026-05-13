package com.redx.tvbox;

/**
 * NativeSecurity - Interface JNI para a biblioteca de segurança nativa
 * 
 * Todas as verificações críticas são executadas em código nativo (C++),
 * tornando muito mais difícil de hookear com Frida/Xposed.
 */
public final class NativeSecurity {
    
    private static boolean isLoaded = false;
    
    static {
        try {
            System.loadLibrary("redxsecurity");
            isLoaded = true;
        } catch (UnsatisfiedLinkError e) {
            isLoaded = false;
        }
    }
    
    private NativeSecurity() {}
    
    /**
     * Verifica se a biblioteca nativa foi carregada com sucesso
     */
    public static boolean isAvailable() {
        return isLoaded;
    }
    
    /**
     * Verifica se um debugger está conectado (ptrace, TracerPid)
     */
    public static native boolean isDebuggerAttached();
    
    /**
     * Detecta Frida server, gadget, threads e arquivos
     */
    public static native boolean detectFrida();
    
    /**
     * Detecta root (su, Magisk, KernelSU)
     */
    public static native boolean detectRoot();
    
    /**
     * Detecta emulador (QEMU, Genymotion, etc)
     */
    public static native boolean detectEmulator();
    
    /**
     * Detecta inline hooks em funções críticas do sistema
     */
    public static native boolean detectHooks();
    
    /**
     * Inicia thread watchdog que monitora debug continuamente
     * Se detectar debug, o app é terminado automaticamente
     */
    public static native void startWatchdog();
    
    /**
     * Executa todas as verificações de segurança
     * 
     * @return Bitmask de ameaças detectadas:
     *   0x01 = Debug
     *   0x02 = Frida ports
     *   0x04 = Injected libraries
     *   0x08 = Frida threads
     *   0x10 = Frida files
     *   0x20 = Root
     *   0x40 = Emulator
     *   0x80 = Hooks
     *   0x00 = Limpo (nenhuma ameaça)
     */
    public static native int fullSecurityCheck();
    
    /**
     * Calcula CRC32 do arquivo DEX para verificação de integridade
     */
    public static native int getDexChecksum(String path);
    
    /**
     * Termina o app imediatamente (usado quando ameaça é detectada)
     * Usa múltiplos métodos de crash para dificultar bypass
     */
    public static native void crash();
    
    // ─────────────────────────────────────────────────────────────────
    // WRAPPER METHODS (fallback para quando nativo não disponível)
    // ─────────────────────────────────────────────────────────────────
    
    /**
     * Verifica segurança com fallback para Java
     */
    public static int safeSecurityCheck() {
        if (isLoaded) {
            try {
                return fullSecurityCheck();
            } catch (Exception e) {
                return 0;
            }
        }
        return 0; // Se não carregou, assume limpo (AppValidator.java faz check Java)
    }
    
    /**
     * Verifica Frida com fallback
     */
    public static boolean safeFridaCheck() {
        if (isLoaded) {
            try {
                return detectFrida();
            } catch (Exception e) {
                return false;
            }
        }
        return false;
    }
    
    /**
     * Verifica debug com fallback
     */
    public static boolean safeDebugCheck() {
        if (isLoaded) {
            try {
                return isDebuggerAttached();
            } catch (Exception e) {
                return false;
            }
        }
        return false;
    }
    
    /**
     * Inicia watchdog com segurança
     */
    public static void safeStartWatchdog() {
        if (isLoaded) {
            try {
                startWatchdog();
            } catch (Exception ignored) {}
        }
    }
}
