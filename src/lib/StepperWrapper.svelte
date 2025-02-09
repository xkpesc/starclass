<script lang="ts">
    import { onMount } from 'svelte';
    import { pushState } from '$app/navigation';
    import { Stepper, Step } from '@skeletonlabs/skeleton';

    import GithubAuth from '../routes/00githubauth/+page.svelte';
    import FetchStarredRepos from '../routes/01fetchstarredrepos/+page.svelte'
    import SelectRepos from '../routes/02selectrepos/+page.svelte';
    import FetchReadmes from '../routes/03fetchreadmes/+page.svelte';
    import LoadModels from '../routes/04loadmodels/+page.svelte';
    import GenDescriptions from '../routes/05gendescriptions/+page.svelte';
    import GenEmbeddings from '../routes/06genembeddings/+page.svelte';
    import Done from '../routes/07done/+page.svelte';
    
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
        { path: 'step2', header: 'Loading Github Starred Repos', component: FetchStarredRepos },
        { path: 'step3', header: 'Select the repos you want to index', component: SelectRepos },
        { path: 'step4', header: '<FetchReadmes>', component: FetchReadmes },
        { path: 'step5', header: '<LoadModels>', component: LoadModels },
        { path: 'step6', header: '<GenDescriptions>', component: GenDescriptions },
        { path: 'step7', header: '<GenEmbeddings>', component: GenEmbeddings },
        { path: 'step8', header: '<Done>', component: Done },
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
                        class="w-full h-full"
                        on:step={handleStepChange}
                        start={currentStepIndex}
                        regionContent="debugh h-full"
                    >
                    
                        {#each steps as { header, component }, i}
                        
                            <Step class="h-full flex flex-col items-stretch justify-between p-10"
                            regionHeader="flex-initial self-center"
                            regionContent="overflow-hidden flex-initial flex-col"
                            regionNavigation="flex-initial pt-4">
                                <svelte:fragment slot="header">{header}</svelte:fragment>
                                    <svelte:component this={component}/>
                            </Step>
                       
                        {/each}
                   
                    </Stepper>
                
        </div>
    </div>
</div>

<style>
    .debugcontent{
        border: 3px solid yellow;
        height: 2500px;
    }
    .debugred{
        border: 2px dotted red;
        box-sizing: border-box;
    }
    .debugblue{
        border: 3px dotted blue;
        box-sizing: border-box;
    }
</style>