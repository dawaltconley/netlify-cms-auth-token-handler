const axios = require('axios')
const cookie = require('cookie')
const qs = require('querystring')

exports.handler = async (event, context) => {
    const {
        GIT_HOSTNAME = 'https://github.com',
        OAUTH_TOKEN_PATH = '/login/oauth/access_token',
        OAUTH_PROVIDER = 'github',
        DOMAIN, CLIENT_ID, CLIENT_SECRET
    } = event.stageVariables || {}

    const returnState = event.queryStringParameters.state
    let { state:cookieState } = cookie.parse(event.headers.Cookie)

    if (!(cookieState && returnState && cookieState === returnState))
        return {
            statusCode: 400,
            body: { message: 'State does not match.' }
        }

    if (!DOMAIN) throw new Error('Must provide origin in stage variable.')
    if (!CLIENT_ID) throw new Error('Must provide client ID in stage variable.')
    if (!CLIENT_SECRET) throw new Error('Must provide slient secret in stage variable.')

    const code = event.queryStringParameters && event.queryStringParameters.code
    if (!code) throw new Error('Did not get expected query string: "code"')

    let mess, content

    try {
        const response = await axios({
            method: 'post',
            baseURL: GIT_HOSTNAME,
            url: OAUTH_TOKEN_PATH,
            params: {
                client_id: event.stageVariables.CLIENT_ID,
                client_secret: event.stageVariables.CLIENT_SECRET,
                code: code
            }
        })
        mess = 'success'
        content = {
            token: qs.parse(response.data).access_token,
            provider: OAUTH_PROVIDER
        }
    } catch (e) {
        console.error('Access Token Error', e)
        mess = 'error'
        content = JSON.stringify(e)
    }

    const script = `
        <script>
            (function() {
                function receiveMessage(e) {
                    console.log("receiveMessage %o", e)
                    if (!e.origin.match(${JSON.stringify(DOMAIN)})) {
                        console.log('Invalid origin: %s', e.origin);
                        return;
                    }
                    // send message to main window with da app
                    window.opener.postMessage(
                        'authorization:${OAUTH_PROVIDER}:${mess}:${JSON.stringify(content)}',
                        e.origin
                    )
                }
                window.addEventListener("message", receiveMessage, false)
                // Start handshare with parent
                console.log("Sending message: %o", "${OAUTH_PROVIDER}")
                window.opener.postMessage("authorizing:${OAUTH_PROVIDER}", "*")
            })()
        </script>`

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html'
        },
        body: script
    }
}
