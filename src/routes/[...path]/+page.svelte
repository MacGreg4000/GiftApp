<script lang="ts">
	import { enhance } from '$app/forms';
	import Header from '#lib/components/Header.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { ACCENT_COLORS } from '#lib/palette';
	import { formatWhen, lockLabel } from '#lib/format';

	let { data, form } = $props();
	let copied = $state(false);

	async function copyPin() {
		if (!form?.pin) return;
		await navigator.clipboard.writeText(form.pin);
		copied = true;
	}
</script>

<svelte:head><title>Administration — Nos Souhaits</title></svelte:head>

{#if data.mode === 'login'}
	<main class="login-shell">
		<section class="hero">
			<div class="hero-stars"></div>
			<p class="brand">Nos Souhaits</p>
			<div class="hero-copy">
				<h1>Espace <em>organisateur</em>.</h1>
			</div>
		</section>
		<section class="login-panel">
			<p class="eyebrow">Administration</p>
			<h2>Bonjour, organisez.</h2>
			<p class="lede">Phrase de passe et code d’authentification. La session expire après 30 minutes d’inactivité.</p>
			{#if form?.message}<p class="alert" role="alert">{form.message}</p>{/if}
			<form method="post" action="?/login" class="stack" use:enhance>
				<label>Nom du compte<input name="username" required autocomplete="username" /></label>
				<label>Phrase de passe<input name="password" type="password" required autocomplete="current-password" /></label>
				<label>Code à 6 chiffres ou code de secours<input name="code" required autocomplete="one-time-code" /></label>
				<button class="btn" type="submit">Entrer</button>
			</form>
			<p class="login-foot"><a href="/">Retour à la connexion des membres</a></p>
		</section>
	</main>
{:else}
	<Header admin name={data.username ?? 'Admin'} adminPath={data.adminPath} active={data.section === '' ? 'groupes' : data.section} />
	<main class="admin-wrap">
		{#if form?.message}<p class="alert" class:ok={!form.message.includes('incorrect')} role="status">{form.message}</p>{/if}
		{#if form?.pin}
			<div class="pin-banner">
				<p>Code de <strong style="letter-spacing:0">{form.displayName}</strong> ({form.loginName})</p>
				<strong>{form.pin}</strong>
				<p>Notez-le maintenant : il ne sera plus affiché. Transmettez-le en main propre.</p>
				<button class="btn soft small" type="button" onclick={copyPin}>{copied ? 'Copié' : 'Copier'}</button>
			</div>
		{/if}

		{#if data.section === 'journal'}
			<h1 class="serif">Journal</h1>
			<p class="sub">Connexions admin, blocages, groupes, membres et rotations de code. Jamais de code ni de jeton.</p>
			<div class="table-card">
				<table class="journal">
					<thead><tr><th>Quand</th><th>Action</th><th>Acteur</th><th>Détail</th></tr></thead>
					<tbody>
						{#each data.journal as entry}
							<tr>
								<td>{formatWhen(new Date(entry.at))}</td>
								<td>{entry.action}</td>
								<td>{entry.actor}</td>
								<td class="quiet">{entry.details ? JSON.stringify(entry.details) : ''}</td>
							</tr>
						{:else}
							<tr><td colspan="4">Aucune action pour le moment.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if data.section === 'parametres'}
			<h1 class="serif">Paramètres</h1>
			<div class="table-card stack">
				<p>Chemin d’administration : <code>{data.adminPath}</code></p>
				<p>Session admin : 12 heures au plus, 30 minutes d’inactivité. Les membres restent connectés 180 jours.</p>
				<p>Les actions sensibles (nouveau code, suppression d’un groupe) redemandent le code d’authentification.</p>
				{#if data.usingDevSecrets}
					<p class="alert">Des secrets de développement sont encore utilisés. Changez-les avant d’ouvrir le site sur Internet.</p>
				{/if}
			</div>
		{:else if data.section === 'listes'}
			<h1 class="serif">Listes</h1>
			<p class="sub">La création des listes de souhaits arrive à l’étape suivante. Le schéma est déjà prêt.</p>
		{:else if data.section === 'sauvegardes'}
			<h1 class="serif">Sauvegardes</h1>
			<div class="table-card">
				{#if data.backup}
					<p>Dernier dump : <strong>{data.backup.file}</strong></p>
					<p>{formatWhen(new Date(data.backup.mtime))}{data.backup.stale ? ' — plus de 36 heures, à vérifier.' : ''}</p>
				{:else}
					<p>Aucune sauvegarde pour le moment. Le conteneur backup en crée une chaque nuit à 3 h (heure de Bruxelles), et une au démarrage si vous l’avez demandé.</p>
				{/if}
				<p class="quiet">Restauration : voir le README, section Sauvegardes. Ne copiez jamais le dossier brut de Postgres.</p>
			</div>
		{:else}
			<div class="pills">
				{#each data.groups as group}
					{@const color = (ACCENT_COLORS[group.accent] ?? ACCENT_COLORS.brique).header}
					<a class="pill" class:on={data.current?.id === group.id} href="{data.adminPath}?g={group.id}">
						<span class="dot" style:background={data.current?.id === group.id ? 'white' : color}></span>
						{group.name}
						{#if group.archivedAt}<small>archivé</small>{/if}
					</a>
				{/each}
				<a class="pill" href="#nouveau-groupe">+ Nouveau groupe</a>
			</div>

			{#if data.current}
				<h1 class="serif" style="margin-bottom:8px">{data.current.name}</h1>
				{#if data.stats}
					<div class="stats">
						<span class="stat">{data.stats.members} membres</span>
						<span class="stat">{data.stats.lists} listes en cours</span>
						<span class="stat">{data.stats.wishes} souhaits</span>
						<span class="stat">{data.stats.taken} déjà pris</span>
					</div>
				{/if}
				<div class="admin-grid">
					<section class="table-card">
						<div class="table-head">
							<h2>Membres et codes d’accès</h2>
							<span class="quiet">Codes à 6 chiffres</span>
						</div>
						<table>
							<thead>
								<tr><th>Membre</th><th>Code</th><th>Dernière visite</th><th></th></tr>
							</thead>
							<tbody>
								{#each data.members as member}
									{@const lock = lockLabel(member.lockLevel, member.lockedUntil ? new Date(member.lockedUntil) : null)}
									<tr>
										<td>
											<div class="person">
												<Avatar name={member.displayName} />
												<span>{member.displayName} {#if member.label}<small>{member.label}</small>{/if}</span>
											</div>
										</td>
										<td class="code">······</td>
										<td>
											{#if lock}<span class="lock-pill">{lock}</span>{:else}{formatWhen(member.lastLoginAt ? new Date(member.lastLoginAt) : null)}{/if}
										</td>
										<td class="row-actions">
											{#if lock}
												<form method="post" action="?/unlockMember">
													<input type="hidden" name="userId" value={member.id} />
													<button class="btn soft small" type="submit">Débloquer</button>
												</form>
											{/if}
											<form method="post" action="?/regeneratePin" class="stack">
												<input type="hidden" name="userId" value={member.id} />
												<input name="totp" inputmode="numeric" placeholder="Code admin" aria-label="Code d’authentification pour régénérer" required />
												<button class="btn small" type="submit">Régénérer</button>
											</form>
										</td>
									</tr>
									{#each data.sessions.filter((item) => item.userId === member.id) as device}
										<tr>
											<td colspan="4" class="quiet">
												Appareil vu {formatWhen(new Date(device.lastSeenAt))} · {device.ip ?? 'IP inconnue'}
												<form method="post" action="?/revokeSession" style="display:inline">
													<input type="hidden" name="token" value={device.token} />
													<input type="hidden" name="userId" value={member.id} />
													<button class="linkish" type="submit">Révoquer</button>
												</form>
											</td>
										</tr>
									{/each}
								{:else}
									<tr><td colspan="4">Aucun membre pour l’instant.</td></tr>
								{/each}
							</tbody>
						</table>
						<h3>Ajouter un membre</h3>
						<form method="post" action="?/addMember" class="form-grid" use:enhance>
							<input type="hidden" name="groupId" value={data.current.id} />
							<label>Prénom affiché<input name="displayName" required maxlength="60" /></label>
							<label>Prénom de connexion<input name="loginName" placeholder="laissé vide = automatique" /></label>
							<label>Rôle dans le groupe<input name="label" maxlength="40" placeholder="Papa, Maman…" /></label>
							<button class="btn" type="submit">Ajouter</button>
						</form>
					</section>
					<section class="side-card">
						<div class="table-head">
							<h2>Qui a pris quoi</h2>
							<span class="quiet">Visible par vous seul</span>
						</div>
						{#if data.taken.length === 0}
							<p class="empty-inline">Aucun cadeau réservé pour le moment. Cette colonne restera cachée aux membres.</p>
						{:else}
							<table>
								<thead><tr><th>Cadeau</th><th>Pour</th><th>Pris par</th></tr></thead>
								<tbody>
									{#each data.taken as row}
										<tr>
											<td>{row.title}<br /><small class="quiet">{row.listTitle}</small></td>
											<td>{row.ownerName}</td>
											<td>{row.buyerName}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						<hr />
						<h3>Groupe</h3>
						<form method="post" action="?/updateGroup" class="stack">
							<input type="hidden" name="id" value={data.current.id} />
							<label>Nom<input name="name" value={data.current.name} required /></label>
							<label>Description<textarea name="description" rows="2">{data.current.description ?? ''}</textarea></label>
							<label>Couleur
								<select name="accent">
									{#each Object.entries(ACCENT_COLORS) as [key, value]}
										<option value={key} selected={key === data.current.accent}>{value.label}</option>
									{/each}
								</select>
							</label>
							<button class="btn soft" type="submit">Enregistrer</button>
						</form>
						<form method="post" action="?/archiveGroup">
							<input type="hidden" name="id" value={data.current.id} />
							<input type="hidden" name="archived" value={data.current.archivedAt ? '0' : '1'} />
							<button class="linkish" type="submit">{data.current.archivedAt ? 'Réactiver' : 'Archiver'}</button>
						</form>
						<form method="post" action="?/deleteGroup" class="stack">
							<input type="hidden" name="id" value={data.current.id} />
							<label>Supprimer : retapez « {data.current.name} »<input name="confirm" /></label>
							<label>Code d’authentification<input name="totp" inputmode="numeric" /></label>
							<button class="btn small" type="submit">Supprimer le groupe</button>
						</form>
					</section>
				</div>
			{:else}
				<p class="sub">Créez le premier groupe, par exemple la famille.</p>
			{/if}

			<section id="nouveau-groupe" class="table-card" style="margin-top:16px">
				<h2>Nouveau groupe</h2>
				<form method="post" action="?/createGroup" class="form-grid" use:enhance>
					<label>Nom<input name="name" required maxlength="80" placeholder="Famille Dupont" /></label>
					<label>Couleur
						<select name="accent">
							{#each Object.entries(ACCENT_COLORS) as [key, value]}
								<option value={key}>{value.label}</option>
							{/each}
						</select>
					</label>
					<label>Description<input name="description" maxlength="500" /></label>
					<button class="btn" type="submit">Créer le groupe</button>
				</form>
			</section>
		{/if}

		<p class="backup-bar">
			<span>
				{#if data.backup}
					Dernière sauvegarde : {formatWhen(new Date(data.backup.mtime))}
				{:else}
					Dernière sauvegarde : aucune pour le moment
				{/if}
			</span>
			<span>Hébergé sur votre NAS</span>
		</p>
	</main>
{/if}
