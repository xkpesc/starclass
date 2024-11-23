<!-- CSS Debugging stuff, because CSS -->
<div class="wrapper">
    <div class="container">
        <div class="very_tall_div">
        Centering a div using "<strong>display: flex</strong>"
        </div>
        <div class="center">
          Centering a div using "<strong>display: flex</strong>"
          </div>
          <div class="very_tall_div">
            Centering a div using "<strong>display: flex</strong>"
            </div>
    </div>
</div>

<style>
    .wrapper {

  width: 100%;
  height: 100vh;
  background-color: rgb(12, 39, 39);
  overflow: hidden;
  /* padding: 20px; */
}


.container {
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  align-self: center;
  padding: 20px;
  height: 100%;
  background-color: #2e2313;
  overflow: scroll;
}

.very_tall_div{
  /* height: 200px; */
  flex: 0 0 auto;
  display: flex;
  background-color: #475f35;
}
.center{
  flex: 1 0 auto;
  display: flex;
  background-color: #475f35;
}
</style>