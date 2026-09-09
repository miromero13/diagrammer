import { Suspense } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'

import { ThemeProvider } from './context/themeContext'
import { AuthProvider } from './context/authContext'
import Loading from './components/shared/loading'
import { store } from './redux/store'
import Routes from './routes'

function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <ThemeProvider>
          <Suspense fallback={
            <div className='grid min-h-screen place-content-center place-items-center'>
              <Loading />
            </div>
          }>
            <BrowserRouter>
              <Routes />
            </BrowserRouter>
          </Suspense>
        </ThemeProvider>
      </AuthProvider>
    </Provider>
  )
}

export default App
