/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_LOCAL_BACKEND: string
  readonly VITE_USE_PAGED_FETCH?: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
