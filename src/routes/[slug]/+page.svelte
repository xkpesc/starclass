<script lang="ts">
    import { error } from '@sveltejs/kit'; // Used to handle errors like 404
    import { page } from '$app/stores'; // Importing the $page store for reactive route params
    import StepperWrapper from '$lib/StepperWrapper.svelte'; // The Stepper logic and UI component
    import { beforeUpdate } from 'svelte';
  import ContainerSlot from '$lib/ContainerSlot.svelte';

    // Declare a reactive store to hold the current step number
    let currentStepIndex = -1;

    beforeUpdate(() => {
        const path = $page.params.slug;
        const pathMatch = path?.match(/^step(\d+)$/); // Extract trailing number from the URL, matching "step" followed by a number
        if (pathMatch) {
            currentStepIndex = parseInt(pathMatch[1], 10)-1; // Parse the number after "step" and set as currentStepIndex
        } else {
            throw error(404, 'Not Found'); // Throw 404 error if the path does not match expected format
        }
    });

</script>

<!-- <h2>[slug]/+page.svelte</h2> -->

<!-- Show loading message if currentStepIndex is -1, otherwise show the StepperComponent -->
{#if currentStepIndex === -1}
    <ContainerSlot><h2>LOADING...</h2></ContainerSlot>
{:else}
    <!-- Pass the validated step number to the StepperComponent -->
    <StepperWrapper params={currentStepIndex} />
{/if}
