<script lang="ts">
	import Header from '#lib/components/Header.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Mes souhaits — Nos Souhaits</title></svelte:head>
<Header name={data.name} active="souhaits" />
<main class="page">
	<header class="greeting">
		<h1>Mes souhaits</h1>
		<p class="sub">Cette page rassemblera bientôt tout ce que vous avez demandé, dans chaque groupe.</p>
	</header>
	<article class="group-card">
		<p class="empty-inline">Aucun souhait à afficher pour l’instant. Les listes s’ouvrent à l’étape suivante.</p>
	</article>
</main>
