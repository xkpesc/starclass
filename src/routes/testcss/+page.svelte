<div class="wrapper">
    <div class="container">
        <div class="very_tall_div">
        Centering a div using "<strong>display: flex</strong>"
        </div>
    </div>
</div>

<style>
    .wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: rgb(12, 39, 39);
  overflow: hidden;
  /* padding: 20px; */
}


.container {
  align-self: center;
  padding: 20px;
  
  background-color: #2e2313;
  overflow: scroll;
}

.very_tall_div{
  height: 3000px;
  display: flex;
  background-color: #475f35;
}
</style>