<script lang="ts">
    import { onMount } from 'svelte';
    import { pushState } from '$app/navigation';
    import { Stepper, Step } from '@skeletonlabs/skeleton';

    import GithubAuth from '../routes/00githubauth/+page.svelte';
    import Loadrepos from '../routes/01githubload/+page.svelte'
    import SelectRepos from '../routes/02selectrepos/+page.svelte';
    
    import DummyStep from '../routes/99dummy/+page.svelte';

    import { beforeUpdate, afterUpdate } from 'svelte';
    import ContainerSlot from '$lib/ContainerSlot.svelte';

    export let params = 0;
    let currentStepIndex = 0;

    beforeUpdate(() => {
        console.log('the SW is about to update');
        console.log(`params beforeUpdate: ${params}`)
        currentStepIndex = params
    });

    afterUpdate(() => {
        console.log('the SW just updated');
    });

    // Define the steps with their corresponding components
    export const steps = [
        { path: 'step1', header: 'Github Authentication', component: GithubAuth },
        { path: 'step2', header: 'Loading Github Starred Repos', component: Loadrepos },
        { path: 'step3', header: 'Select the repos you want to index', component: SelectRepos },
        { path: 'step4', header: 'Loading AI models...', component: DummyStep },
        { path: 'step5', header: '<placeholder>', component: DummyStep },
        { path: 'step6', header: '<placeholder>', component: DummyStep },
        { path: 'step7', header: '<placeholder>', component: DummyStep },
    ];



    // Determine the current step based on the URL path
    onMount(() => {
        console.log('the slug SW just mounted');
        console.log(`params onmount:`)
        console.log(params)
        console.log(`currentStepIndex onmount: ${currentStepIndex}`)
        currentStepIndex = params
    });

    function handleStepChange(event) {
        const newStep = event.detail.state.current;
        pushState(steps[newStep].path, currentStepIndex);
    }
</script>


<div class="container h-full mx-auto flex flex-col justify-center items-center">
    <div class="text-center p-16">
        <!-- <h1 class="h1">Starclass</h1> -->
    </div>
    <div class="container mx-auto px-20">
        <div class="w-full card p-10 flex flex-col text-token bg-initial items-center">
            <Stepper
                class="w-full"
                on:step={handleStepChange}
                start={currentStepIndex}
            >
            <ContainerSlot>

                {#each steps as { header, component }, i}
                    <Step>
                        <svelte:fragment slot="header">{header}</svelte:fragment>
                        <svelte:component this={component} />
                    </Step>
                {/each}


            </ContainerSlot>

            </Stepper>
        </div>
    </div>
</div>