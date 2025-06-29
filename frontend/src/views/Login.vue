<template>
  <div class="login-container">
    <img src="/assets/homenas-logo.png" alt="HomeNAS Logo" class="logo" />
    <h1>Inicia sesión en HomeNAS OS</h1>
    <form class="login-form">
      <input type="text" placeholder="Usuario" />
      <input type="password" placeholder="Contraseña" />
      <button type="submit">Entrar</button>
    </form>
  </div>
</template>

<style scoped>
.login-container {
  text-align: center;
  margin-top: 5rem;
  font-family: sans-serif;
}
.logo {
  width: 200px;
  margin-bottom: 2rem;
}
.login-form input {
  display: block;
  margin: 1rem auto;
  padding: 0.75rem;
  width: 250px;
}
.login-form button {
  background-color: #0077cc;
  color: white;
  padding: 0.75rem 2rem;
  border: none;
  cursor: pointer;
}
</style>
