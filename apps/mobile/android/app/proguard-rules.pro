# ─────────────────────────────────────────────────────────────────────────
# R8 keep rules — release builds only.
#
# Minification is switched on by `android.enableMinifyInReleaseBuilds` in
# ../gradle.properties; read the comment there for why it was off until
# 2026-09-09.
#
# ⚠️ TWO THINGS ABOUT THIS FILE ARE EASY TO LOSE:
#   1. The repo .gitignore ignores `android` wholesale. This file is
#      force-added (`git add -f`). A future edit that is not re-added is
#      invisible to every other checkout.
#   2. Production AABs are built from C:\dpb, whose android tree is populated
#      by the sync list in scripts/build-preview.sh. This file is on that
#      list. If it is dropped, R8 runs with no project rules and the failure
#      is a runtime crash in release only — nothing at build time says so.
#
# WHAT IS DELIBERATELY NOT HERE. Blanket `-keep class <lib>.** { *; }` rules
# were considered and rejected for the big SDKs (Mapbox, Google Play
# services, Firebase): they ship consumer rules inside their own AARs, and
# keeping them wholesale would give back most of the DEX savings this change
# exists to win. Verified 2026-09-09 that these ship consumer rules that
# already cover the reflective paths:
#   react-native (ReactAndroid/proguard-rules.pro) — keeps every
#     `implements NativeModule`, every @DoNotStrip class/member, every
#     @ReactProp method, the TurboModule core, JNI and Hermes.
#   expo-modules-core, expo, expo-image, expo-location, expo-notifications,
#     expo-task-manager, expo-updates, react-native-svg.
# The React Native wrapper modules that ship no rules of their own
# (google-signin, purchases, view-shot, screens, safe-area-context, netinfo,
# async-storage, play-install-referrer, rnmapbox) are all reached either as
# `NativeModule` implementations or directly from the generated PackageList,
# so React Native's rules and ordinary reachability already cover them.
# ─────────────────────────────────────────────────────────────────────────

# Readable stack traces after obfuscation. AGP embeds the mapping file in the
# AAB, so Play Console and Android Vitals deobfuscate automatically. Sentry
# does NOT — no Sentry Android Gradle plugin is applied in this project — so
# Java/Kotlin frames there stay obfuscated until mapping.txt is uploaded.
# Hermes frames are unaffected, and they are most of this app's crashes.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Generic signatures and annotations. Kotlin reflection, Gson-style
# serialisation inside third-party SDKs, and Play services all read these.
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault

# Our own code. MainActivity / MainApplication are already kept because the
# manifest names them; this covers anything reached only by JNI or by name.
-keep class com.defensivepedal.** { *; }

# Belt-and-suspenders for the JNI boundary. React Native's own rules cover
# this, but a native method whose owner gets renamed fails at call time with
# an UnsatisfiedLinkError that points nowhere useful.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# Optional dependencies that OkHttp / Sentry / Play services reference but do
# not ship. Without these, R8 fails the build with "Missing class". If a new
# one appears, AGP writes the exact rule to add into
# app/build/outputs/mapping/<variant>/missing_rules.txt — copy it here rather
# than reaching for a broad -keep.
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn java.lang.instrument.**
-dontwarn sun.misc.**

# NOTE: the previous contents of this file kept `com.swmansion.reanimated.**`.
# react-native-reanimated is not a dependency of this app (motion is built on
# React Native's own Animated API — see CLAUDE.md "Motion polish"), so that
# rule was dead and has been dropped. react-native-screens
# (com.swmansion.rnscreens) IS a dependency and needs no explicit rule.
