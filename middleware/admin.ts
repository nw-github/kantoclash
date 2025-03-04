export default defineNuxtRouteMiddleware(() => {
  const { user } = useUserSession();
  if (!user.value || !user.value.admin) {
    return navigateTo("/");
  }
});
