<script lang="ts">
	import { page } from '$app/state';
</script>

<main class="page">
	<p class="eyebrow">Nos Souhaits</p>
	<h1 class="serif" style="font-size:3rem;margin:8px 0">{page.status}</h1>
	<p>{page.error?.message ?? 'Cette page est introuvable.'}</p>
	<p><a href="/">Retour à l’accueil</a></p>
</main>
