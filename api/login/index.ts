import {VercelRequest, VercelResponse} from '@vercel/node'

import StatusCodes from 'http-status-codes'
import fetch from 'node-fetch'
import {_throw, firstValue, run} from "../_lib/utils.js";
import {idTokenSigner, idTokenVerifier} from "../_lib/jwt.js";
import {getUser, newUser} from "../_lib/user-store.js";

const oauthAppCredentials = {
    clientId: process.env.CLIENT_ID ?? _throw(Error('CLIENT_ID is not set in environment')),
    clientSecret: process.env.CLIENT_SECRET ?? _throw(Error('CLIENT_SECRET is not set in environment')),
}

export default async (request: VercelRequest, response: VercelResponse) => run(async () => {
    switch (request.method) {
        case 'GET':
            return await handleGet(request, response)
        default:
            return response.status(StatusCodes.METHOD_NOT_ALLOWED)
                .send({error: StatusCodes.getStatusText(StatusCodes.METHOD_NOT_ALLOWED)})
    }
}).catch(error => {
    console.error("[ERROR]", error)
    return response.status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send({error: StatusCodes.getStatusText(StatusCodes.INTERNAL_SERVER_ERROR)})
})


async function handleGet(request: VercelRequest, response: VercelResponse) {
    console.log('handleGet')

    const error = firstValue(request.query.error)
    if (error) {
        return response.redirect(StatusCodes.TEMPORARY_REDIRECT, '/login?' + new URLSearchParams({
            error,
        }))
    }

    let user: {
        login: string,
        accessToken: {
            access_token: string,
            expires_at: Date,
            refresh_token: string,
            refresh_token_expires_at: Date
        }
    }

    const code = firstValue(request.query.code)
    if (code) {
        console.log('got oauth code query parameter')
        const codeVerifier = firstValue(request.cookies['pkce_verifier'])
        user = await newUser(code, codeVerifier)
    } else {
        const idToken = request.cookies['id_token']
        if (idToken) {
            console.log('got id_token cookie')
            const callerIdentity = idTokenVerifier(idToken)
            user = await getUser(callerIdentity.user)
        }
    }

    if (!user) {
        console.log('redirect to github login')
        const authParams: Record<string, string> = {
            client_id: oauthAppCredentials.clientId,
            scope: 'repo',
            redirect_uri: `${request.headers['x-forwarded-proto']}://${request.headers['x-forwarded-host']}${request.url.replace(/\?.*$/, '')}`,
            // TODO state: '1234'
        }
        const codeChallenge = firstValue(request.query.code_challenge)
        const codeChallengeMethod = firstValue(request.query.code_challenge_method)
        if (codeChallenge && codeChallengeMethod) {
            authParams.code_challenge = codeChallenge
            authParams.code_challenge_method = codeChallengeMethod
        }
        return response.redirect(StatusCodes.TEMPORARY_REDIRECT, 'https://github.com/login/oauth/authorize?' + new URLSearchParams(authParams))
    }

    console.log('user:', user.login)
    return response.setHeader('Set-Cookie', cookiesFrom({
        id_token: {
            value: idTokenSigner({
                user: user.login,
            }),
            expires: user.accessToken.expires_at,
            secure: true,
            httpOnly: true,
            sameSite: 'Strict',
        },
        pkce_verifier: {
            value: '',
            expires: new Date(0),
            sameSite: 'Lax',
        },
    })).redirect(StatusCodes.TEMPORARY_REDIRECT, '/')

    async function exchangeOAuthCodeForToken(code: string) {
        return fetch('https://github.com/login/oauth/access_token?' + new URLSearchParams({
            client_id: oauthAppCredentials.clientId,
            client_secret: oauthAppCredentials.clientSecret,
            // TODO redirect_uri: 'https://exampel.com',
            code,
        }), {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            }
        }).then(res => res.json())
    }

    async function refreshOAuthToken(refresh_token: string) {
        return fetch('https://github.com/login/oauth/access_token?' + new URLSearchParams({
            client_id: oauthAppCredentials.clientId,
            client_secret: oauthAppCredentials.clientSecret,
            // TODO redirect_uri: 'https://exampel.com',
            grant_type: 'refresh_token',
            refresh_token,
        }), {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            }
        }).then(res => res.json())
    }
}

// --- helper functions
function cookiesFrom(cookies: Record<string, {
    value: string,
    expires?: Date,
    secure?: boolean,
    httpOnly?: boolean,
    sameSite?: 'Strict' | 'Lax' | 'None'
}>): string[] {
    return Object.entries(cookies).map(([key, value]) => {
        let cookie = `${key}=${encodeURIComponent(typeof value === 'string' ? value : value.value)}`
        if (typeof value !== 'string') {
            if (value.expires) cookie += `; Expires=${value.expires.toUTCString()}`
            if (value.secure) cookie += '; Secure'
            if (value.httpOnly) cookie += '; HttpOnly'
            if (value.sameSite) cookie += `; SameSite=${value.sameSite}`
        }
        return cookie
    })
}
