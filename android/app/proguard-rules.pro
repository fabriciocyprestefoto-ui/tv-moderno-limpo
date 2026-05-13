# ═══════════════════════════════════════════════════════════════
# ProGuard / R8 — RED X TV Box
#
# Versão simplificada: regras agressivas (optimizationpasses 7,
# repackageclasses, flattenpackagehierarchy, allowaccessmodification)
# foram REMOVIDAS porque quebravam descoberta de plugin Capacitor 8
# e Activity launch (Manifest guarda fully-qualified names).
#
# Anti-tampering forte fica para quando houver ferramenta dedicada
# (ex.: DexProtector / Bangcle) — R8 sozinho não substitui.
# ═══════════════════════════════════════════════════════════════

# ── Capacitor / Cordova ─────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @interface com.getcapacitor.annotation.** { *; }

-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# JavascriptInterface (bridge JS↔Java)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Activities e Plugin do app ──────────────────────────────────
# Manifest declara classes pelo fully-qualified name.
-keep class com.redx.tvbox.MainActivity { *; }
-keep class com.redx.tvbox.ExoPlayerActivity { *; }
-keep class com.redx.tvbox.NativePlayerPlugin { *; }
-keep class com.redx.tvbox.NativePlayerPlugin$* { *; }

# AppValidator (chamadas dinâmicas)
-keep class com.redx.tvbox.AppValidator { *; }

# JNI nativo
-keep class com.redx.tvbox.NativeSecurity {
    native <methods>;
    public static *;
}

# ── Media3 (DefaultDataSource usa Class.forName em runtime) ─────
-keep class androidx.media3.** { *; }
-keep interface androidx.media3.** { *; }
-dontwarn androidx.media3.**

# ── AndroidX / WebView ──────────────────────────────────────────
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
    public boolean *(android.webkit.WebView, java.lang.String);
}

# ── Atributos (Capacitor descobre plugin via reflection) ────────
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes RuntimeVisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault

# ── Enums + Parcelable ──────────────────────────────────────────
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# ── Resources ───────────────────────────────────────────────────
-keepclassmembers class **.R$* {
    public static <fields>;
}

# ── Native methods ──────────────────────────────────────────────
-keepclasseswithmembernames class * {
    native <methods>;
}

# ── Logs: remove só verbose/debug em release ────────────────────
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
}

# ── Warnings ────────────────────────────────────────────────────
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn java.lang.invoke.**
-ignorewarnings
