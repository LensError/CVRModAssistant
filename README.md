# CVR Mod Assistant

This project was developed with the assistance of AI, originally as a personal tool created out of a desire for a specialized presets feature. While it started out of boredom and just for fun, I decided to share it on GitHub in case others might also find the mod presets and management features useful.

A modern, fast, and beautiful mod manager for [ChilloutVR](https://store.steampowered.com/app/661130/ChilloutVR/).

![Main Interface](media/mainimage.png)

## Features

- **Clean and Intuitive Interface**: Designed for ease of use with a focus on readability and smooth navigation.
- **Mod Management**: Browse, install, update, and remove mods from the CVRmg community with ease.
- **Sync Support**: One-click synchronization to keep your local mods up to date.
- **In-App Updates**: Checks for updates on startup and lets you download and apply them without leaving the app (installer build).
- **Multi-Target Distribution**: Choose between a professional installer or a clean, portable executable.

## Presets

Manage different mod configurations effortlessly with the new Presets feature. Create, rename, and switch between presets for different playstyles or testing environments.

![Presets Bar](media/presetsbar.png)
![Adding a Preset](media/addingpreset.png)

Presets can also be exported and imported as JSON files from the **Options** page, making it easy to back up your mod lists, move them between machines, or share them with friends so they can load the exact same set of mods in one click.

## Installation

Download the latest version from [Releases](https://github.com/LensError/CVRModAssistant/releases).

*   **Installer (`CVRModAssistant_Setup.exe`)**: Recommended for most users. Includes Desktop/Start Menu shortcuts, faster boot times, and in-app update support.
*   **Portable (`CVRModAssistant.exe`)**: No installation required. Just run it from wherever you like. Updates must be applied manually — the app will notify you and link to the latest release.

Once running, updates are checked on startup and the result is shown automatically in the **Options** page.

## Building from source

Requires [Node.js](https://nodejs.org/).

```
npm install
npm run build
```

Output is placed in `dist/`.

## Credits

This project was built upon the foundations of [CVRMelonAssistant](https://github.com/Nirv-git/CVRMelonAssistant). This rewrite would not have been possible without the excellent work done by [Nirv-git](https://github.com/Nirv-git) and the original contributors.

> [!IMPORTANT]
> **Disclaimer**: Modding ChilloutVR is [officially allowed](https://docs.chilloutvr.net/official/legal/tos/#7-modding-our-games) per the ChilloutVR Terms of Service. However, **CVR Mod Assistant is NOT affiliated with and/or endorsed by the ChilloutVR Team.** Use this tool at your own risk.

## License

This project is licensed under the [MIT License](LICENSE).
