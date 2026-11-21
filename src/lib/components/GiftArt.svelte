<script lang="ts">
	let { size = 72 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
	<rect x="14" y="34" width="52" height="34" rx="6" fill="#e0b15a" />
	<path d="M14 42h52" stroke="#fffaf2" stroke-width="4" />
	<path d="M40 34v34" stroke="#fffaf2" stroke-width="4" />
	<path d="M40 34c-8-14-22-12-18-4s14 6 18 4c4-14 18-12 18-4s-10 10-18 4z" fill="#b8322a" />
</svg>
