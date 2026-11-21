<script lang="ts">
	import { themeArt } from '#lib/palette';

	let { theme }: { theme: string } = $props();
	const kind = $derived(themeArt(theme));
</script>

<div class="theme-art" data-theme={kind} aria-hidden="true">
	{#if kind === 'noel'}
		<svg viewBox="0 0 360 180" fill="none">
			<path d="M40 150 L70 70 L100 150 Z" fill="#1f6b45" />
			<path d="M62 150 L100 48 L138 150 Z" fill="#2f8a58" />
			<path d="M118 150 L168 28 L218 150 Z" fill="#174e34" />
			<rect x="160" y="150" width="16" height="18" fill="#c4922e" />
			<circle cx="168" cy="24" r="8" fill="#e0b15a" />
			<circle cx="120" cy="78" r="6" fill="#e7c56a" />
			<circle cx="196" cy="96" r="5" fill="#f4e2a8" />
			<circle cx="78" cy="108" r="4" fill="#f6d7a2" />
			<circle cx="250" cy="36" r="3" fill="#f6e7b2" />
			<circle cx="300" cy="58" r="2.5" fill="#f6e7b2" />
			<circle cx="40" cy="40" r="2" fill="#f6e7b2" />
			<path d="M20 158 H340" stroke="#e0b15a" stroke-width="3" />
		</svg>
	{:else if kind === 'saint_nicolas'}
		<svg viewBox="0 0 360 180" fill="none">
			<path d="M150 150 V78 h60 v72" fill="#f4e2a8" />
			<path d="M138 86 h84 l-10-28 h-64 z" fill="#e0b15a" />
			<path d="M168 58 h24 l-4-22 h-16 z" fill="#f6e7b2" />
			<circle cx="180" cy="30" r="6" fill="#e0b15a" />
			<path d="M120 150 h120" stroke="#f6d7a2" stroke-width="4" />
			<circle cx="70" cy="48" r="3" fill="#f6e7b2" />
			<circle cx="300" cy="40" r="4" fill="#f6e7b2" />
			<circle cx="260" cy="78" r="2.5" fill="#f8edd0" />
			<path d="M48 120 h28 M62 106 v28" stroke="#f6e7b2" stroke-width="3" />
		</svg>
	{:else if kind === 'anniversaire'}
		<svg viewBox="0 0 360 180" fill="none">
			<ellipse cx="92" cy="70" rx="22" ry="28" fill="#ec7a5c" />
			<ellipse cx="150" cy="52" rx="20" ry="26" fill="#e0b15a" />
			<ellipse cx="210" cy="74" rx="24" ry="30" fill="#1f7f78" />
			<ellipse cx="268" cy="58" rx="18" ry="24" fill="#f3d38a" />
			<path d="M92 42 v-16 M150 26 v-14 M210 44 v-16 M268 34 v-12" stroke="#3a2a22" stroke-width="2" />
			<circle cx="92" cy="22" r="3" fill="#3a2a22" />
			<circle cx="150" cy="8" r="3" fill="#3a2a22" />
			<circle cx="210" cy="24" r="3" fill="#3a2a22" />
			<circle cx="268" cy="18" r="3" fill="#3a2a22" />
			<path d="M40 150 h280" stroke="#d7b089" stroke-width="3" />
		</svg>
	{:else}
		<svg viewBox="0 0 360 180" fill="none">
			<path d="M70 110 h220 l-18 36 H88 z" fill="#e0b15a" />
			<path d="M70 110 c40-36 180-36 220 0" stroke="#f6e7b2" stroke-width="8" fill="none" />
			<circle cx="180" cy="78" r="10" fill="#f6e7b2" />
			<path d="M40 156 h280" stroke="#c4922e" stroke-width="3" />
		</svg>
	{/if}
</div>
