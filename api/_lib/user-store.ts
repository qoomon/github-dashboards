import {kv} from "@vercel/kv";
import fetch from "node-fetch";
import {_throw} from "./utils.js";

const oauthAppCredentials = {
    clientId: process.env.CLIENT_ID ?? _throw(Error('CLIENT_ID is not set in environment')),
    clientSecret: process.env.CLIENT_SECRET ?? _throw(Error('CLIENT_SECRET is not set in environment')),
}

export async function getUser(login: string) {
    let user = await kv.json.get(`github_user:${login}`).then(it => {
        it.accessToken.expires_at = new Date(it.accessToken.expires_at)
        it.accessToken.refresh_token_expires_at = new Date(it.accessToken.refresh_token_expires_at)
        return it
    })

    if (user && user.accessToken.expires_at < new Date(Date.now() + 1000 * 60 * 60)) {
        console.log('refresh token')
        const tokenResponse = await refreshOAuthToken(user.accessToken.refresh_token)
        user = {
            login: user.login,
            accessToken: tokenResponse,
        }
        await kv.json.set(`github_user:${user.login}`, '$', user)
    }

    return user
}

export async function newUser(code: string, codeVerifier?: string) {
    let tokenResponse = await exchangeOAuthCodeForToken(code, codeVerifier)
    if (!tokenResponse?.access_token) {
        throw Error('Invalid token request')
    }

    const userInfo = await fetch('https://api.github.com/user', {
        headers: {'Authorization': `token ${tokenResponse.access_token}`}
    }).then(res => res.json())
    if (!userInfo.login) {
        throw Error('Invalid token scopes')
    }

    const user = {
        login: userInfo.login,
        accessToken: tokenResponse,
    }
    await kv.json.set(`github_user:${user.login}`, '$', user)

    return user
}

async function exchangeOAuthCodeForToken(code: string, codeVerifier?: string) {
    const params: Record<string, string> = {
        client_id: oauthAppCredentials.clientId,
        client_secret: oauthAppCredentials.clientSecret,
        code,
    }
    if (codeVerifier) {
        params.code_verifier = codeVerifier
    }
    return fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
    }).then(res => res.json()).then(parseTokenResponseData)
}

async function refreshOAuthToken(refresh_token: string) {
    return fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: oauthAppCredentials.clientId,
            client_secret: oauthAppCredentials.clientSecret,
            grant_type: 'refresh_token',
            refresh_token,
        }).toString(),
    }).then(res => res.json()).then(parseTokenResponseData)
}

function parseTokenResponseData(data: any) {
    data.expires_at = new Date(Date.now() + 1000 * data.expires_in)
    delete data.expires_in
    data.refresh_token_expires_at = new Date(Date.now() + 1000 * data.refresh_token_expires_in)
    delete data.refresh_token_expires_in
    return data
}
