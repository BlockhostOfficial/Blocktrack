import '../styles/main.css'
import '../styles/icons.css'
import '../styles/fonts.css'
import type { AppProps } from 'next/app'

function App ({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default App
