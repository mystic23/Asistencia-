plugins {
    id("com.android.application")
}

val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "co.asistencia.oficina"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.asistencia.oficina"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // Llave fija para que cada versión nueva se instale encima de la anterior.
    signingConfigs {
        create("release") {
            storeFile = file("asistencia.keystore")
            storePassword = "asistencia"
            keyAlias = "asistencia"
            keyPassword = "asistencia"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
}

// La interfaz es la misma app web del repositorio: se copia dentro del APK.
val copyWeb by tasks.registering(Copy::class) {
    from(rootDir.parentFile) {
        include("index.html", "app.js", "holidays.js", "styles.css", "manifest.webmanifest", "icons/**")
    }
    into(layout.buildDirectory.dir("generated/webassets/www"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
