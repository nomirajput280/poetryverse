plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android { namespace = "com.poetryverse.app"; compileSdk = 35
    defaultConfig { applicationId = "com.poetryverse.app"; minSdk = 23; targetSdk = 35; versionCode = 1; versionName = "1.0.0"; buildConfigField("String", "POETRYVERSE_URL", "\"https://poetryverse.786.deno.net\"") }
    buildFeatures { buildConfig = true }
}
