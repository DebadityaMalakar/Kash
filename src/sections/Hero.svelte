<script>
	let redirectToLogin = () => {
		window.location.href = '/Login';
	};
</script>

<section class="hero is-fullheight has-background-dark">
	<div class="hero-body">
		<div class="container has-text-centered">
			<h1 class="title is-1 has-text-white">
				Take Control of Your <span class="has-text-warning">Kash</span>
			</h1>
			<p class="subtitle is-4 has-text-grey-light">
				Smart budgeting meets AI-powered spending predictions
			</p>
			<div class="buttons is-centered">
				<button class="button is-warning is-large" on:click={redirectToLogin}>
					<strong>Get Started Free</strong>
				</button>
				<button class="button is-outlined is-large has-text-white" on:click={redirectToLogin}>
					See How It Works
				</button>
			</div>
		</div>
	</div>
</section>

<style>
	:global(.has-background-dark) {
		background-color: #1a1a1a !important;
	}

	:global(.has-background-grey-darker) {
		background-color: #333 !important;
	}

	:global(.has-text-warning) {
		color: #ff3e00 !important;
	}

	:global(.button.is-warning) {
		background-color: #ff3e00;
		color: white;
		border: none;
	}

	:global(.button.is-warning:hover) {
		background-color: #ff6a33;
	}

	:global(.button.is-outlined) {
		border-color: #666;
	}

	:global(.button.is-outlined:hover) {
		border-color: #ff3e00;
		color: #ff3e00 !important;
	}
</style>
