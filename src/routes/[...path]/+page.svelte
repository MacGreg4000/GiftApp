<script lang="ts">
	import { enhance } from '$app/forms';
	import Header from '#lib/components/Header.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { ACCENT_COLORS, THEME_LABELS } from '#lib/palette';
	import { formatWhen, lockLabel } from '#lib/format';
	import { formatEuros } from '#lib/money';
	import ListCreateForm from '#lib/components/ListCreateForm.svelte';

	let { data, form } = $props();
	let copied = $state(false);
	let visibleFor = $state('');
	let visiblePin = $state('');

	async function copyPin() {
		if (!form?.pin) return;
		await navigator.clipboard.writeText(form.pin);
		copied = true;
	}

	function revealed(value: typeof form): { id: string; pin: string | null } | null {
		if (!value || !('revealedFor' in value)) return null;
		const row = value as { revealedFor?: string; revealedPin?: string | null };
		if (!row.revealedFor) return null;
		return { id: row.revealedFor, pin: row.revealedPin ?? null };
	}

	$effect(() => {
		const row = revealed(form);
		if (!row?.pin) return;
		visibleFor = row.id;
		visiblePin = row.pin;
		const timer = setTimeout(() => {
			visibleFor = '';
			visiblePin = '';
		}, 5000);
		return () => clearTimeout(timer);
	});
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
				<p>
					{form && 'generated' in form && form.generated ? 'Code généré' : 'Code enregistré'} pour
					<strong style="letter-spacing:0">{form.displayName}</strong>
				</p>
				<strong>{form.pin}</strong>
				<p>Connexion avec le prénom « {form.displayName} » et ce code. L’œil le réaffiche 5 secondes.</p>
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
				<p>Changer un code ou supprimer un groupe demande une fois le code de l’appli 2FA. Il reste valable 10 minutes.</p>
				{#if data.usingDevSecrets}
					<p class="alert">Des secrets de développement sont encore utilisés. Changez-les avant d’ouvrir le site sur Internet.</p>
				{/if}
			</div>
		{:else if data.section === 'listes'}
			<h1 class="serif">Listes</h1>
			<p class="sub">Créez une liste ici, pour un membre ou pour tout le groupe. Les membres y ajoutent ensuite leurs souhaits.</p>
			{#if data.groups.length > 0}
				<section class="table-card" style="margin-bottom:16px">
					<h2>Nouvelle liste</h2>
					<ListCreateForm groups={data.groups} people={data.people} />
				</section>
			{:else}
				<p class="empty-inline">Créez d’abord un groupe, puis une liste.</p>
				<p><a class="btn small" href="{data.adminPath}#nouveau-groupe">Nouveau groupe</a></p>
			{/if}
			<div class="table-card">
				<table>
					<thead>
						<tr><th>Liste</th><th>Groupe</th><th>Souhaits</th><th>Pris</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.lists as list}
							<tr>
								<td>
									<a href="/listes/{list.id}">{list.title}</a>
									<br /><small class="quiet">{THEME_LABELS[list.theme] ?? 'Liste'}{#if list.recipientName} · pour {list.recipientName}{/if}{#if list.archivedAt} · archivée{/if}</small>
								</td>
								<td>{list.groupName}</td>
								<td>{list.wishes}</td>
								<td>{list.taken}</td>
								<td>
									<form method="post" action="?/archiveList">
										<input type="hidden" name="id" value={list.id} />
										<input type="hidden" name="archived" value={list.archivedAt ? '0' : '1'} />
										<button class="btn soft small" type="submit">{list.archivedAt ? 'Réactiver' : 'Archiver'}</button>
									</form>
								</td>
							</tr>
						{:else}
							<tr><td colspan="5">Aucune liste. Le formulaire au-dessus en crée une.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
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
				{#if !data.stepUp}
					<section class="table-card" style="margin-bottom:16px">
						<h2>Confirmez avec votre appli 2FA</h2>
						<p class="quiet">
							C’est le code à 6 chiffres de Aegis, 1Password ou Google Authenticator — pas le code d’un membre.
							Une confirmation suffit pour les 10 prochaines minutes (nouveau code, suppression d’un groupe).
						</p>
						<form method="post" action="?g={data.current.id}&/confirmStepUp" class="form-grid">
							<input type="hidden" name="groupId" value={data.current.id} />
							<label>
								Code de ton appli 2FA
								<input name="totp" inputmode="numeric" autocomplete="one-time-code" required pattern={'[0-9]{6}'} placeholder="123456" />
							</label>
							<button class="btn" type="submit">Confirmer</button>
						</form>
					</section>
				{:else}
					<p class="quiet">Appli 2FA confirmée pour quelques minutes. Vous pouvez changer les codes sans la ressaisir.</p>
				{/if}
				{#if data.stats}
					<div class="stats">
						<span class="stat">{data.stats.members} membres</span>
						<span class="stat">{data.stats.lists} listes en cours</span>
						<span class="stat">{data.stats.wishes} souhaits</span>
						<span class="stat">{data.stats.taken} déjà pris</span>
					</div>
				{/if}
				<section class="table-card" id="nouvelle-liste" style="margin-bottom:16px">
					<div class="table-head">
						<h2>Nouvelle liste</h2>
						<span class="quiet">Pour un membre, ou pour tout le groupe</span>
					</div>
					<ListCreateForm groups={[data.current]} people={data.people} groupId={data.current.id} />
				</section>
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
										<td class="code">
											{#if visibleFor === member.id && visiblePin}
												<span class="revealed">{visiblePin}</span>
											{:else}
												······
											{/if}
											<form method="post" action="?g={data.current.id}&/revealPin">
												<input type="hidden" name="userId" value={member.id} />
												<button class="eye" type="submit" aria-label="Afficher le code de {member.displayName}">
													<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
														<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" />
														<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
													</svg>
												</button>
											</form>
											{#if revealed(form)?.id === member.id && !revealed(form)?.pin}
												<span class="quiet">Code non disponible, redéfinis-le.</span>
											{/if}
										</td>
										<td>
											{#if lock}<span class="lock-pill">{lock}</span>{:else}{formatWhen(member.lastLoginAt ? new Date(member.lastLoginAt) : null)}{/if}
										</td>
										<td class="row-actions">
											{#if lock}
												<form method="post" action="?g={data.current.id}&/unlockMember">
													<input type="hidden" name="userId" value={member.id} />
													<button class="btn soft small" type="submit">Débloquer</button>
												</form>
											{/if}
											<form method="post" action="?g={data.current.id}&/setPin" class="pin-edit">
												<input type="hidden" name="userId" value={member.id} />
												<label>
													Nouveau code
													<input name="pin" inputmode="numeric" autocomplete="off" maxlength="6" pattern={'[0-9]{6}'} placeholder="6 chiffres" required />
												</label>
												<button class="btn soft small" type="submit" name="generate" value="1" formnovalidate>Générer</button>
												<button class="btn small" type="submit">Enregistrer</button>
											</form>
											<details class="name-edit">
												<summary class="btn soft small">Modifier le prénom</summary>
												<form method="post" action="?g={data.current.id}&/updateMember" class="pin-edit">
													<input type="hidden" name="userId" value={member.id} />
													<input type="hidden" name="groupId" value={data.current.id} />
													<input type="hidden" name="label" value={member.label ?? ''} />
													<input type="hidden" name="isActive" value={member.isActive ? '1' : '0'} />
													<label>
														Prénom affiché
														<input name="displayName" value={member.displayName} maxlength="60" required />
													</label>
													<label>
														Prénom de connexion
														<input name="loginName" value={member.loginName} maxlength="40" required />
													</label>
													<button class="btn small" type="submit">Enregistrer</button>
												</form>
											</details>
										</td>
									</tr>
									{#each data.sessions.filter((item) => item.userId === member.id) as device}
										<tr>
											<td colspan="4" class="quiet">
												Appareil vu {formatWhen(new Date(device.lastSeenAt))} · {device.ip ?? 'IP inconnue'}
												<form method="post" action="?g={data.current.id}&/revokeSession" style="display:inline">
													<input type="hidden" name="token" value={device.token} />
													<input type="hidden" name="userId" value={member.id} />
													<button class="linkish" type="submit">Révoquer</button>
												</form>
											</td>
										</tr>
									{/each}
								{:else}
									<tr><td colspan="4">Aucun membre. Ajoutez-en un avec le formulaire sous le tableau.</td></tr>
								{/each}
							</tbody>
						</table>
						<h3>Ajouter un membre</h3>
						<form method="post" action="?g={data.current.id}&/addMember" class="form-grid" use:enhance>
							<input type="hidden" name="groupId" value={data.current.id} />
							<label>Prénom affiché<input name="displayName" required maxlength="60" /></label>
							<label>Prénom de connexion<input name="loginName" placeholder="laissé vide = automatique" /></label>
							<label>Rôle dans le groupe<input name="label" maxlength="40" placeholder="Papa, Maman…" /></label>
							<label>
								Code à 6 chiffres
								<input name="pin" inputmode="numeric" autocomplete="off" maxlength="6" pattern={'[0-9]{6}'} placeholder="6 chiffres" required />
							</label>
							<button class="btn soft" type="submit" name="generate" value="1" formnovalidate>Générer</button>
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
								<thead><tr><th>Cadeau</th><th>Pour</th><th>Pris par</th><th>Quand</th></tr></thead>
								<tbody>
									{#each data.taken as row}
										<tr>
											<td>{row.title}<br /><small class="quiet">{row.listTitle}</small></td>
											<td>{row.ownerName}</td>
											<td>{row.buyerName}</td>
											<td>{formatWhen(new Date(row.at))}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						<hr />
						<h3>Cadeaux communs</h3>
						{#if data.pledges.length === 0}
							<p class="empty-inline">Aucune participation pour le moment.</p>
						{:else}
							<table>
								<thead><tr><th>Cadeau</th><th>Pour</th><th>Participe</th><th>Part</th></tr></thead>
								<tbody>
									{#each data.pledges as row}
										<tr>
											<td>{row.title}<br /><small class="quiet">{row.listTitle}{row.funded ? ' · financé' : ''}{row.purchased ? ' · acheté' : ''}</small></td>
											<td>{row.ownerName}</td>
											<td>{row.memberName}</td>
											<td>{row.amountCents != null ? formatEuros(row.amountCents) : `${row.fractionNum}/${row.fractionDen}`}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						<hr />
						<h3>Groupe</h3>
						<form method="post" action="?g={data.current.id}&/updateGroup" class="stack">
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
						<form method="post" action="?g={data.current.id}&/archiveGroup">
							<input type="hidden" name="id" value={data.current.id} />
							<input type="hidden" name="archived" value={data.current.archivedAt ? '0' : '1'} />
							<button class="linkish" type="submit">{data.current.archivedAt ? 'Réactiver' : 'Archiver'}</button>
						</form>
						<form method="post" action="?g={data.current.id}&/deleteGroup" class="stack">
							<input type="hidden" name="id" value={data.current.id} />
							<label>Supprimer : retapez « {data.current.name} »<input name="confirm" /></label>
							<p class="quiet">La suppression utilise la confirmation 2FA des 10 dernières minutes.</p>
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
