<script lang="ts">
	import { LIST_THEMES } from '#lib/palette';

	let {
		groups,
		people,
		groupId = ''
	}: {
		groups: { id: string; name: string }[];
		people: { id: string; displayName: string; groupId: string }[];
		groupId?: string;
	} = $props();

	let chosen = $state('');
	const activeGroup = $derived(groupId || chosen || groups[0]?.id || '');
	const roster = $derived(people.filter((person) => person.groupId === activeGroup));
</script>

<form method="post" action={groupId ? `?g=${groupId}&/createList` : '?/createList'} class="form-grid">
	{#if groupId}
		<input type="hidden" name="groupId" value={groupId} />
	{:else}
		<label>
			Groupe
			<select name="groupId" value={activeGroup} onchange={(event) => (chosen = event.currentTarget.value)}>
				{#each groups as group}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>
		</label>
	{/if}
	<label>Nom<input name="title" required maxlength="100" placeholder="Noël 2026" /></label>
	<label>
		Thème
		<select name="theme">
			{#each LIST_THEMES as theme}
				<option value={theme.id}>{theme.label}</option>
			{/each}
		</select>
	</label>
	<label>Date <span class="quiet">facultative</span><input name="eventDate" type="date" /></label>
	<label>
		Pour qui
		<select name="recipientId">
			<option value="">Tout le groupe — chacun ajoute les siens</option>
			{#each roster as person}
				<option value={person.id}>{person.displayName}</option>
			{/each}
		</select>
	</label>
	<button class="btn" type="submit">Créer la liste</button>
</form>
<p class="quiet">Si une personne est choisie, seule elle peut y déposer des souhaits.</p>
