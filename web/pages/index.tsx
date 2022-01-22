import type {NextPage} from 'next'
import Head from 'next/head'

const Home: NextPage = () => {
    return (
        <div>
            <Head>
                <link rel="stylesheet"
                      href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;700&display=swap"/>
                <link rel="icon" type="image/svg+xml" href="../public/logo.svg"/>

                <meta charSet="UTF-8"/>

                <script defer src="js/main.js"/>

                <title>Minetrack</title>
            </Head>

            <main>
                <div id="tooltip"/>

                <div id="status-overlay">
                    <img className="logo-image" src="logo.svg" alt="Minetrack logo"/>
                    <h1 className="logo-text">Minetrack</h1>
                    <div id="status-text">Connecting...</div>
                </div>

                <div id="push">

                    <div id="perc-bar"/>

                    <header>
                        <div className="header-possible-row-break column-left">
                            <img className="logo-image" src="logo.svg" alt="Minetrack logo"/>
                            <h1 className="logo-text">Minetrack</h1>
                            <p className="logo-status">Counting <span className="global-stat"
                                                                      id="stat_totalPlayers">0</span> players on <span
                                className="global-stat" id="stat_networks">0</span> Minecraft servers.</p>
                        </div>

                        <div className="header-possible-row-break column-right">
                            <div id="sort-by" className="header-button header-button-single"><span
                                className="icon-sort-amount-desc"/>
                                Sort By<br/><strong id="sort-by-text">...</strong></div>

                            <div id="settings-toggle" className="header-button header-button-single"
                                 style={{marginLeft: "20px"}}><span
                                className="icon-gears"/> Graph Controls
                            </div>
                        </div>
                    </header>

                    <div id="big-graph"/>

                    <div id="big-graph-controls">
                        <div id="big-graph-controls-drawer">
                            <div id="big-graph-checkboxes"/>

                            <span className="graph-controls-setall">
					<a minetrack-show-type="all" className="button graph-controls-show"><span
                        className="icon-eye"/> Show All</a>
					<a minetrack-show-type="none" className="button graph-controls-show"><span
                        className="icon-eye-slash"/> Hide All</a>
					<a minetrack-show-type="favorites" className="button graph-controls-show"><span
                        className="icon-star"/> Only Favorites</a>
				</span>
                        </div>
                    </div>

                    <div id="server-list"/>

                </div>
            </main>

            <footer id="footer">
                <span className="icon-code"/> Powered by open source software - <a
                href="https://github.com/Cryptkeeper/Minetrack">make it your own!</a>
            </footer>
        </div>
    )
}

export default Home
