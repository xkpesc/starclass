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

<div class="container h-screen m-auto flex flex-col justify-center items-center debugred overflow-hidden">
    <!-- <div class="text-center p-16">
        <h1 class="h1">Starclass</h1>
    </div> -->
    <div class="container mx-auto py-20 flex justify-center items-center h-full debugblue">
        <div class="card w-full p-10 flex flex-col text-token bg-initial items-center h-full max-h-full ">

                
                    <Stepper
                        class="w-full h-full overflow-hidden"
                        on:step={handleStepChange}
                        start={currentStepIndex}
                        regionContent="overflow-auto debugh justify-center h-full"
                    >
                    
                        {#each steps as { header, component }, i}
                        
                            <Step >
                                <svelte:fragment slot="header">{header}</svelte:fragment>
                                <!-- <div id="tempip" class="h-full overflow-auto debugh flex flex-col justify-center bg-slate-500"> -->
                                    <svelte:component this={component} />
                                <!-- </div> -->
                            </Step>
                       
                        {/each}
                   
                    </Stepper>
                
        </div>
    </div>
</div>

<style>
    .debugh {
        /* height: 600px; */
        /* overflow-y: scroll; */
        /* max-height: 1000px; */
    }
    .debugcontent{
        border: 3px solid yellow;
        height: 2500px;
    }
    .debugred{
        border: 2px solid red;
        box-sizing: border-box;
    }
    .debugblue{
        border: 3px dotted blue;
        box-sizing: border-box;
    }
</style>