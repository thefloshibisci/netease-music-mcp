#include <dlfcn.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

// MediaRemote is a macOS system framework used by the Now Playing controls.
// Keeping the tiny bridge in a separate process avoids UI scripting and gives
// Node a strict, allowlisted interface: probe or send the next-track command.
typedef bool (*MRMediaRemoteSendCommandFn)(int command, void *options);

enum {
  MR_COMMAND_NEXT_TRACK = 4,
};

int main(int argc, char **argv) {
  if (argc != 2 || (strcmp(argv[1], "probe") != 0 && strcmp(argv[1], "next") != 0)) {
    fputs("usage: media-remote probe|next\n", stderr);
    return 64;
  }

  void *framework = dlopen(
      "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote",
      RTLD_LAZY | RTLD_LOCAL);
  if (framework == NULL) {
    fprintf(stderr, "MediaRemote unavailable: %s\n", dlerror());
    return 69;
  }

  MRMediaRemoteSendCommandFn send_command =
      (MRMediaRemoteSendCommandFn)dlsym(framework, "MRMediaRemoteSendCommand");
  if (send_command == NULL) {
    fprintf(stderr, "MRMediaRemoteSendCommand unavailable: %s\n", dlerror());
    dlclose(framework);
    return 69;
  }

  if (strcmp(argv[1], "probe") == 0) {
    puts("{\"available\":true}");
    dlclose(framework);
    return 0;
  }

  const bool accepted = send_command(MR_COMMAND_NEXT_TRACK, NULL);
  printf("{\"accepted\":%s,\"command\":\"next\"}\n", accepted ? "true" : "false");
  dlclose(framework);
  return accepted ? 0 : 70;
}
