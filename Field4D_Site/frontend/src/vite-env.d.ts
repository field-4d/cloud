/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_LOCAL_BACKEND: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
