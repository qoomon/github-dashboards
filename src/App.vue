<script setup lang="ts">
import {RouterView} from 'vue-router'
import {onBeforeMount} from "vue";
import {initiatePkce} from "@/auth/pkce";

onBeforeMount(async () => {
  const user = await fetch('/api/login/status')
      .then(response => {
        if (response.status !== 200) {
          return null
        }
        return response.json()
      })

  if (!user) {
    console.log('User not logged in, initiating PKCE login')
    const {codeChallenge, codeVerifier} = await initiatePkce()
    // Pass the verifier to the backend via a short-lived cookie so the
    // serverless callback can include it in the token-exchange request.
    document.cookie = `pkce_verifier=${encodeURIComponent(codeVerifier)}; Path=/; SameSite=Lax; Max-Age=300`
    window.location.href = '/login?' + new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
  }
})
</script>

<template>
  <RouterView/>
</template>
