/**
 * Anti-Reverse Engineering - Proteções contra análise e modificação
 * Ofuscação de strings sensíveis e anti-debugging
 */

/**
 * Ofusca string usando XOR simples
 */
function obfuscateString(str: string, key: number = 0x42): string {
  return Array.from(str)
    .map((char) => String.fromCharCode(char.charCodeAt(0) ^ key))
    .join('');
}

/**
 * Deofusca string
 */
function deobfuscateString(str: string, key: number = 0x42): string {
  return obfuscateString(str, key); // XOR é reversível
}

/**
 * Armazena strings sensíveis ofuscadas
 */
export class SecureString {
  private data: string;
  private key: number;

  constructor(value: string) {
    this.key = Math.floor(Math.random() * 255) + 1;
    this.data = obfuscateString(value, this.key);
  }

  getValue(): string {
    return deobfuscateString(this.data, this.key);
  }

  toString(): string {
    return '[SecureString]';
  }
}

/**
 * Anti-debugging: Detecta e bloqueia ferramentas de análise
 */
export class AntiDebug {
  private static debuggerCheckInterval: number | null = null;
  private static resizeInterval: number | null = null;
  private static contextMenuHandler: ((e: MouseEvent) => boolean | void) | null = null;
  private static keydownHandler: ((e: KeyboardEvent) => boolean | void) | null = null;

  /**
   * Inicia verificação contínua de debugger
   */
  static start(_onDebugDetected?: () => void): void {
    // Desabilitado: causa gargalos de performance na TV Box
  }

  /**
   * Para verificação de debugger e remove todos os listeners
   */
  static stop(): void {
    if (this.debuggerCheckInterval) {
      clearInterval(this.debuggerCheckInterval);
      this.debuggerCheckInterval = null;
    }
    if (this.resizeInterval) {
      clearInterval(this.resizeInterval);
      this.resizeInterval = null;
    }
    if (this.contextMenuHandler) {
      document.removeEventListener('contextmenu', this.contextMenuHandler as EventListener);
      this.contextMenuHandler = null;
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler as EventListener);
      this.keydownHandler = null;
    }
  }

  /**
   * Verifica se debugger está presente usando timing (sem usar a keyword `debugger`
   * para evitar overhead incondicional no bundle de produção)
   */
  // private static isDebuggerPresent(): boolean {
  //   const start = performance.now();
  //   try { (0, eval)('void 0'); } catch { /* ignore */ }
  //   const end = performance.now();
  //   return end - start > 100;
  // }

  /**
   * Detecta abertura de DevTools via mudança de tamanho
   */
  // private static detectDevToolsResize(): void {
  //   const threshold = 160;
  //   let devtoolsOpen = false;
  //
  //   this.resizeInterval = window.setInterval(() => {
  //     const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  //     const heightThreshold = window.outerHeight - window.innerHeight > threshold;
  //
  //     if (widthThreshold || heightThreshold) {
  //       if (!devtoolsOpen) {
  //         devtoolsOpen = true;
  //         window.location.reload();
  //       }
  //     } else {
  //       devtoolsOpen = false;
  //     }
  //   }, 500);
  // }

  /**
   * Bloqueia menu de contexto (botão direito)
   */
  // private static blockContextMenu(): void {
  //   this.contextMenuHandler = (e: MouseEvent) => {
  //     e.preventDefault();
  //     return false;
  //   };
  //   document.addEventListener('contextmenu', this.contextMenuHandler as EventListener);
  // No-op since continuous checks are disabled
}
/**
 * Anti-tampering: Verifica integridade do código
 */
export class AntiTampering {
  private static originalFunctions = new Map<string, Function>();
  private static tamperCheckInterval: number | null = null;

  /**
   * Protege funções críticas contra modificação
   */
  static protectFunctions(): void {
    // Salvar referências originais
    this.originalFunctions.set('fetch', window.fetch);
    this.originalFunctions.set('XMLHttpRequest', window.XMLHttpRequest);
    this.originalFunctions.set('WebSocket', window.WebSocket);

    // Verificar periodicamente se foram modificadas
    this.tamperCheckInterval = window.setInterval(() => {
      if (window.fetch !== this.originalFunctions.get('fetch')) {
        this.handleTampering();
      }

      if (window.XMLHttpRequest !== this.originalFunctions.get('XMLHttpRequest')) {
        this.handleTampering();
      }

      if (window.WebSocket !== this.originalFunctions.get('WebSocket')) {
        this.handleTampering();
      }
    }, 5000);
  }

  /**
   * Para as verificações de tampering
   */
  static stop(): void {
    if (this.tamperCheckInterval) {
      clearInterval(this.tamperCheckInterval);
      this.tamperCheckInterval = null;
    }
    this.originalFunctions.clear();
  }

  /**
   * Verifica se console foi sobrescrito
   */
  static checkConsole(): boolean {
    return typeof console.log === 'function' && typeof console.error === 'function';
  }

  /**
   * Ação quando tampering é detectado
   */
  private static handleTampering(): void {
    // Limpar dados sensíveis
    localStorage.clear();
    sessionStorage.clear();

    // Recarregar página
    window.location.reload();
  }
}

/**
 * Ofusca números (útil para IDs, portas, etc)
 */
export function obfuscateNumber(num: number): string {
  const key = 0x1337;
  return (num ^ key).toString(36);
}

/**
 * Deofusca números
 */
export function deobfuscateNumber(str: string): number {
  const key = 0x1337;
  return parseInt(str, 36) ^ key;
}

/**
 * Cria um proxy para objeto com acesso rastreado a propriedades sensíveis
 * (sem limpar o console em acessos legítimos que contenham 'key' no nome)
 */
export function createSecureProxy<T extends object>(obj: T): T {
  const sensitiveKeys = new Set([
    'apikey',
    'api_key',
    'secretkey',
    'secret_key',
    'token',
    'password',
  ]);
  return new Proxy(obj, {
    get(target, prop) {
      // Limpar console apenas em propriedades genuinamente sensíveis
      if (typeof prop === 'string' && sensitiveKeys.has(prop.toLowerCase())) {
        console.clear();
      }
      return target[prop as keyof T];
    },
  });
}

/**
 * Inicializa todas as proteções anti-reverse.
 * Retorna função de cleanup para evitar memory leak do setInterval.
 */
export function initAntiReverse(): (() => void) | undefined {
  // Apenas em produção
  if (import.meta.env.DEV) {
    return undefined;
  }

  // Iniciar anti-debug
  AntiDebug.start(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  });

  // Proteger funções críticas (CAUSAVA LOOP DE RELOAD NO CAPACITOR)
  // AntiTampering.protectFunctions();

  // Limpar console periodicamente (armazenar ID para cleanup)
  const consoleClearInterval = window.setInterval(() => {
    console.clear();
  }, 10000);

  return () => {
    clearInterval(consoleClearInterval);
  };
}
