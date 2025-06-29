<template>
  <div class="wizard">
    <h2>Bienvenido a HomeNAS OS</h2>
    <p>Vamos a ayudarte a configurar tu sistema paso a paso.</p>

    <div v-if="step === 1">
      <h3>Paso 1: Nombre del sistema</h3>
      <input v-model="hostname" placeholder="Ej: homenas" />
      <button @click="nextStep">Siguiente</button>
    </div>

    <div v-if="step === 2">
      <h3>Paso 2: Crear usuario administrador</h3>
      <input v-model="username" placeholder="Usuario" />
      <input type="password" v-model="password" placeholder="Contraseña" />
      <button @click="nextStep">Siguiente</button>
    </div>

    <div v-if="step === 3">
      <h3>Paso 3: Apps recomendadas</h3>
      <label><input type="checkbox" v-model="apps" value="FileBrowser" /> FileBrowser</label><br/>
      <label><input type="checkbox" v-model="apps" value="Portainer" /> Portainer</label><br/>
      <label><input type="checkbox" v-model="apps" value="TVHeadend" /> TVHeadend</label><br/>
      <button @click="finishSetup">Finalizar</button>
    </div>

    <div v-if="step === 4">
      <h3>¡Listo!</h3>
      <p>Tu HomeNAS OS está configurado. Reiniciando interfaz...</p>
    </div>
  </div>
</template>

<script>
export default {
  name: "SetupWizard",
  data() {
    return {
      step: 1,
      hostname: "",
      username: "",
      password: "",
      apps: []
    };
  },
  methods: {
    nextStep() {
      this.step++;
    },
    finishSetup() {
      // Aquí iría lógica real (guardar config, instalar apps, etc.)
      this.step++;
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    }
  }
}
</script>

<style scoped>
.wizard {
  text-align: center;
  padding: 2rem;
}
.wizard input {
  display: block;
  margin: 1rem auto;
  padding: 0.5rem;
}
</style>
