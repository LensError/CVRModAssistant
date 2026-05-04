# CVR Mod Assistant

A modern, fast, and beautiful mod manager for [ChilloutVR](https://store.steampowered.com/app/661130/ChilloutVR/).

![Main Interface](media/mainimage.png)

## Features

- **Clean and Intuitive Interface**: Designed for ease of use with a focus on readability and smooth navigation.
- **Mod Management**: Browse, install, update, and remove mods from the CVRmg community.
- **Sync Support**: One-click synchronization to keep your local mods up to date.
- **In-App Updates**: Checks for updates on startup and lets you download and apply them without leaving the app (NSIS installer and AppImage builds).
- **Linux / Proton Support**: Detects your ChilloutVR game folder on Linux and includes a first-launch setup guide for MelonLoader under Proton.

## Presets

Manage different mod configurations effortlessly with the new Presets feature. Create, rename, and switch between presets for different playstyles or testing environments.

![Presets Bar](media/presetsbar.png)
![Adding a Preset](media/addingpreset.png)

Presets can also be exported and imported as JSON files from the **Options** page, making it easy to back up your mod lists, move them between machines, or share them with friends so they can load the exact same set of mods in one click.

## Installation

Download the latest version from [Releases](https://github.com/LensError/CVRModAssistant/releases).

### Windows

*   **Installer (`CVRModAssistant_Setup.exe`)**: Recommended for most users. Includes Desktop/Start Menu shortcuts, faster boot times, and in-app update support.
*   **Portable (`CVRModAssistant.exe`)**: No installation required. Run from anywhere. The app will notify you when an update is available and open the releases page.

### Linux

*   **AppImage (`CVRModAssistant_Linux.AppImage`)**: Run directly. Make it executable (`chmod +x`) and double-click or run from terminal. Supports in-app updates.
*   **.deb (`CVRModAssistant_Linux.deb`)**: Install with `sudo dpkg -i CVRModAssistant_Linux.deb`. The app will notify you when an update is available and open the releases page.
*   **pacman (`CVRModAssistant_Linux.pacman`)**: Install with `sudo pacman -U CVRModAssistant_Linux.pacman`. Same update behaviour as .deb.

#### Proton launch option (required for MelonLoader on Linux)

ChilloutVR runs through Proton on Linux. MelonLoader needs a DLL override to load properly. In Steam, right-click **ChilloutVR → Properties → General → Launch Options** and paste:

```
WINEDLLOVERRIDES="version=n,b" %command%
```

CVR Mod Assistant will show a one-time setup guide for this on first launch.

## Building from source

Requires [Node.js](https://nodejs.org/).

```bash
npm install

# Windows - produces portable .exe and NSIS installer in dist/
npm run build

# Linux - produces AppImage, .deb, and .pacman in dist/
npm run build:linux
```

To run without packaging:

```bash
npm start           # Windows
npm run start:linux # Linux

npm run dev         # Windows (DevTools open)
npm run dev:linux   # Linux (DevTools open)
```

Output is placed in `dist/`.

## Credits

This project was built upon the foundations of [CVRMelonAssistant](https://github.com/Nirv-git/CVRMelonAssistant). This rewrite would not have been possible without the excellent work done by [Nirv-git](https://github.com/Nirv-git) and the original contributors.

> [!IMPORTANT]
> **Disclaimer**: Modding ChilloutVR is [officially allowed](https://docs.chilloutvr.net/official/legal/tos/#6-modding-our-game) per the ChilloutVR Terms of Service. However, **CVR Mod Assistant is not created by or affiliated with ChilloutVR or the ChilloutVR team in any way.** Use this tool at your own risk.

> [!NOTE]
> This project were written with AI assistance. As with any AI-generated code, bugs may be present. Please report anything unexpected on [GitHub Issues](https://github.com/LensError/CVRModAssistant/issues).

## License

This project is licensed under the [MIT License](LICENSE).
