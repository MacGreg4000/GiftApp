<script lang="ts">
	let digits = $state(['', '', '', '', '', '']);
	let inputs = $state<HTMLInputElement[]>([]);

	function spread(raw: string, start: number) {
		const chars = raw.replace(/\D/g, '').slice(0, 6 - start).split('');
		const next = [...digits];
		chars.forEach((char, offset) => {
			next[start + offset] = char;
		});
		digits = next;
		const focusAt = Math.min(start + chars.length, 5);
		queueMicrotask(() => inputs[focusAt]?.focus());
	}

	function onInput(index: number, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const value = target.value.replace(/\D/g, '');
		if (value.length > 1) {
			spread(value, index);
			return;
		}
		const next = [...digits];
		next[index] = value.slice(-1);
		digits = next;
		if (value && index < 5) inputs[index + 1]?.focus();
	}

	function onKey(index: number, event: KeyboardEvent) {
		if (event.key === 'Backspace' && !digits[index] && index > 0) {
			const next = [...digits];
			next[index - 1] = '';
			digits = next;
			inputs[index - 1]?.focus();
		}
	}
</script>

<div class="pin" role="group" aria-label="Code à six chiffres">
	{#each digits as digit, index}
		<input
			bind:this={inputs[index]}
			name={'c' + index}
			type="password"
			inputmode="numeric"
			autocomplete={index === 0 ? 'one-time-code' : 'off'}
			maxlength="6"
			aria-label={'Chiffre ' + (index + 1)}
			value={digit}
			oninput={(event) => onInput(index, event)}
			onkeydown={(event) => onKey(index, event)}
		/>
	{/each}
</div>
