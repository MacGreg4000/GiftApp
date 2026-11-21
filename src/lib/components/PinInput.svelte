<script lang="ts">
	import { placeDigits } from '#lib/pin-digits';

	let digits = $state(['', '', '', '', '', '']);
	let inputs = $state<HTMLInputElement[]>([]);
	let ignoreEmpty = false;

	function paint(next: string[], focus: number) {
		digits = next;
		queueMicrotask(() => {
			next.forEach((char, index) => {
				const input = inputs[index];
				if (input && input.value !== char) input.value = char;
			});
			const field = inputs[focus];
			field?.focus();
			field?.select();
		});
	}

	function onBeforeInput(index: number, event: InputEvent) {
		const data = event.data ?? '';
		if (data.replace(/\D/g, '').length > 1) {
			event.preventDefault();
			ignoreEmpty = true;
			const placed = placeDigits(digits, data, index);
			paint(placed.digits, placed.focus);
		}
	}

	function onPaste(index: number, event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text') ?? '';
		if (!/\d/.test(text)) return;
		event.preventDefault();
		ignoreEmpty = true;
		const placed = placeDigits(digits, text, index);
		paint(placed.digits, placed.focus);
	}

	function onInput(index: number, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const value = target.value.replace(/\D/g, '');
		if (value.length === 0 && ignoreEmpty) {
			ignoreEmpty = false;
			target.value = digits[index] ?? '';
			return;
		}
		ignoreEmpty = false;
		if (value.length > 1) {
			const placed = placeDigits(digits, value, index);
			paint(placed.digits, placed.focus);
			return;
		}
		const next = [...digits];
		next[index] = value.slice(-1);
		digits = next;
		target.value = next[index] ?? '';
		if (next[index] && index < 5) inputs[index + 1]?.focus();
	}

	function onKey(index: number, event: KeyboardEvent) {
		if (event.key === 'Backspace' && !digits[index] && index > 0) {
			const next = [...digits];
			next[index - 1] = '';
			digits = next;
			const previous = inputs[index - 1];
			if (previous) previous.value = '';
			previous?.focus();
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
			maxlength="1"
			aria-label={'Chiffre ' + (index + 1)}
			value={digit}
			onbeforeinput={(event) => onBeforeInput(index, event)}
			onpaste={(event) => onPaste(index, event)}
			oninput={(event) => onInput(index, event)}
			onkeydown={(event) => onKey(index, event)}
		/>
	{/each}
</div>
