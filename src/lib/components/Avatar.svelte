<script lang="ts">
	import { avatarColor, initial } from '#lib/palette';

	let { name, large = false }: { name: string; large?: boolean } = $props();
</script>

<span class="avatar" class:lg={large} style:background={avatarColor(name)} aria-hidden="true">
	{initial(name)}
</span>
