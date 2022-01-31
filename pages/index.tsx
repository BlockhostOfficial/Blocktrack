import type { NextPage } from 'next'
import Head from 'next/head'
import { useEffect, useState } from 'react'
import { footer, title } from '../config/data'
import Image from 'next/image'

const Home: NextPage = () => {
  const [app, setApp] = useState<any>()

  useEffect(() => {
    if (app) return

    import('../lib/app').then((imports) => {
      const app = new imports.App()

      setApp(app)

      app.init()

      window.addEventListener('resize', function () {
        app.percentageBar.redraw()

        // Delegate to GraphDisplayManager which can check if the resize is necessary
        app.graphDisplayManager.requestResize()
      }, false)
    })
  }, [app])

  return (
    <div>
      <Head>
        <meta charSet='UTF-8' />

        <link rel='icon' type='image/svg+xml' href='/logo.svg' />

        <title>{title}</title>
      </Head>

      <main>
        <div id='tooltip' />

        <div id='status-overlay'>
          <Image width={72} height={72} className='logo-image' src='/logo.svg' alt={`${title} logo`} />
          <h1 className='logo-text'>{title}</h1>
          <div id='status-text'>Connecting...</div>
        </div>

        <div id='push'>

          <div id='perc-bar' />

          <header>
            <div className='header-possible-row-break column-left'>
              <Image width={36} height={36} className='logo-image' src='/logo.svg' alt={`${title} logo`} />
              <h1 className='logo-text'>{title}</h1>
              <p className='logo-status'>Counting <span
                className='global-stat'
                id='stat_totalPlayers'
                                                  >0
                                                  </span> players on <span
                className='global-stat' id='stat_networks'
                                 >0
                                 </span> Minecraft servers.
              </p>
            </div>

            <div className='header-possible-row-break column-right'>
              <div id='sort-by' className='header-button header-button-single'><span
                className='icon-sort-amount-desc'
                                                                               />
                Sort By<br /><strong id='sort-by-text'>...</strong>
              </div>

              <div
                id='settings-toggle' className='header-button header-button-single'
                style={{ marginLeft: '20px' }}
              ><span
                className='icon-gears'
              /> Graph Controls
              </div>
            </div>
          </header>

          <div id='big-graph' />

          <div id='big-graph-controls'>
            <div id='big-graph-controls-drawer'>
              <div id='big-graph-checkboxes' />

              <span className='graph-controls-setall'>
                <a minetrack-show-type='all' className='button graph-controls-show'><span
                  className='icon-eye'
                                                                                    /> Show All
                </a>
                <a minetrack-show-type='none' className='button graph-controls-show'><span
                  className='icon-eye-slash'
                                                                                     /> Hide All
                </a>
                <a minetrack-show-type='favorites' className='button graph-controls-show'><span
                  className='icon-star'
                                                                                          /> Only Favorites
                </a>
              </span>
            </div>
          </div>

          <div id='server-list' />
        </div>
      </main>

      <footer id='footer'>
        <div dangerouslySetInnerHTML={{ __html: footer }} />
      </footer>
    </div>
  )
}

// noinspection JSUnusedGlobalSymbols
export default Home
