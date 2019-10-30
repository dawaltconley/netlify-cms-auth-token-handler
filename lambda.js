const axios = require('axios')
const qs = require('querystring')

const extractCode = ({ queryStringParameters={} }) => queryStringParameters.code

exports.handler = async (event, context) => {
    const oauthProvider = event.stageVariables.OAUTH_PROVIDER || 'github'
    const originPattern = event.stageVariables.DOMAIN
    if (!originPattern) throw new Error('Must set origin in DOMAIN stage variable.')

    const code = extractCode(event)
    if (!code) throw new Error('Did not get expected query string: "code"')

    let mess, content

    try {
        const response = await axios({
            method: 'post',
            url: 'https://github.com/login/oauth/access_token',
            params: {
                client_id: event.stageVariables.CLIENT_ID,
                client_secret: event.stageVariables.CLIENT_SECRET,
                code: code
            }
        })
        mess = 'success'
        content = {
            token: qs.parse(response.data).access_token,
            provider: oauthProvider
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
                    if (!e.origin.match(${JSON.stringify(originPattern)})) {
                        console.log('Invalid origin: %s', e.origin);
                        return;
                    }
                    // send message to main window with da app
                    window.opener.postMessage(
                        'authorization:${oauthProvider}:${mess}:${JSON.stringify(content)}',
                        e.origin
                    )
                }
                window.addEventListener("message", receiveMessage, false)
                // Start handshare with parent
                console.log("Sending message: %o", "${oauthProvider}")
                window.opener.postMessage("authorizing:${oauthProvider}", "*")
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
