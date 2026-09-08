// Capacitor Android Build Configuration
export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
    url?: string;
  };
  android?: {
    buildOptions?: {
      keystorePath?: string;
      keystoreAlias?: string;
    };
  };
}

const config: CapacitorConfig = {
  appId: 'com.arcadepulse.neostrike2d',
  appName: 'Neo Strike 2D',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;
