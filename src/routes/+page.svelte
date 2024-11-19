<script lang="ts">
	import { Stepper, Step } from '@skeletonlabs/skeleton';
</script>


<div class="container h-full mx-auto flex flex-col justify-center items-center">
	<div class="text-center p-16">
		<h1 class="h1">Starclass</h1>
	</div>
	<div class="container mx-auto px-20">
		<div class="w-full card p-10 flex flex-col text-token bg-initial items-center">
			<Stepper class="w-full" >
				<Step>
					<svelte:fragment slot="header">(header)</svelte:fragment>
					(content)
				</Step>
				<Step>
					<svelte:fragment slot="header">(header)</svelte:fragment>
					(content)
				</Step>
				<Step>
					<svelte:fragment slot="header">(header)</svelte:fragment>
					(content)
				</Step>
				<Step>
					<svelte:fragment slot="header">(header)</svelte:fragment>
					(content)
				</Step>
			</Stepper>
		</div>
	</div>
</div>
