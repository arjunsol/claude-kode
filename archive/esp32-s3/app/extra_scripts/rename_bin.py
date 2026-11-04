Import("env")

# Name the flashed binary after app_name so it's identifiable on-device,
# instead of PlatformIO's generic "firmware".
cfg = env.GetProjectConfig()
section = "env:" + env["PIOENV"]
app_name = cfg.get(section, "app_name", fallback=None)
if app_name:
    env.Replace(PROGNAME=app_name)
