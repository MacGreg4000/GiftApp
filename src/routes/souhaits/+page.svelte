<script lang="ts">
	import Header from '#lib/components/Header.svelte';
	import { formatEuros } from '#lib/money';

	let { data, form } = $props();
</script>

<svelte:head><title>Mes souhaits — Nos Souhaits</title></svelte:head>
<Header name={data.name} active="souhaits" />
<main class="page">
	<header class="greeting">
		<h1>Mes souhaits</h1>
		<p class="sub">Ce que vous avez demandé, et ce que vous avez promis d’acheter.</p>
	</header>
	{#if form?.message}<p class="alert">{form.message}</p>{/if}
	<section class="table-card">
		<h2>Mes idées</h2>
		{#if data.wishes.length === 0}
			<p class="empty-inline">Vous n’avez encore rien demandé.</p>
			<p><a class="btn small" href="/accueil">Voir mes groupes</a></p>
		{:else}
			<ul class="plain-list">
				{#each data.wishes as wish}
					<li>
						<a href="/listes/{wish.listId}">{wish.title}</a>
						<span class="quiet">{wish.listTitle} · {wish.groupName}{#if wish.isSurprise} · surprise{/if}{#if wish.isShared} · cadeau commun{/if}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
	<section class="table-card">
		<h2>Mes participations</h2>
		{#if data.pledges.length === 0}
			<p class="empty-inline">Vous ne participez à aucun cadeau commun.</p>
			<p><a class="btn small" href="/accueil">Voir les listes</a></p>
		{:else}
			<ul class="plain-list">
				{#each data.pledges as item}
					<li>
						<a href="/listes/{item.listId}">{item.title}</a>
						<span class="quiet">
							Pour {item.ownerName} · {item.listTitle} ·
							{item.amountCents != null ? formatEuros(item.amountCents) : `${item.fractionNum}/${item.fractionDen}`}
							{#if item.purchased} · acheté{:else if item.funded} · financé{/if}
						</span>
						{#if !item.purchased}
							<form method="post" action="?/retirerPart">
								<input type="hidden" name="wishId" value={item.wishId} />
								<button class="btn ghost small" type="submit">Retirer ma part</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
	<section class="table-card">
		<h2>Ce que j’achète</h2>
		{#if data.buying.length === 0}
			<p class="empty-inline">Rien de réservé pour le moment. Sur la liste d’un proche, « Je l’achète » le retire des autres.</p>
		{:else}
			<ul class="plain-list">
				{#each data.buying as item}
					<li>
						{#if item.gone}
							<strong>{item.title}</strong>
							<span class="quiet">Retiré par {item.ownerName}. Vous pouvez annuler la réservation.</span>
						{:else}
							<a href="/listes/{item.listId}">{item.title}</a>
							<span class="quiet">Pour {item.ownerName} · {item.listTitle}{#if item.changed} · le souhait a changé{/if}</span>
						{/if}
						<div class="card-actions">
							<form method="post" action="?/cancel">
								<input type="hidden" name="wishId" value={item.wishId} />
								<button class="btn ghost small" type="submit">Annuler</button>
							</form>
							{#if !item.gone && item.status === 'reserve'}
								<form method="post" action="?/bought">
									<input type="hidden" name="wishId" value={item.wishId} />
									<button class="btn soft small" type="submit">C’est acheté</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
