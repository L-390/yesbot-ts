import {
  Message,
  EmbedBuilder,
  MessageReaction,
  User,
  EmbedField,
} from "discord.js";
import {
  Command,
  CommandHandler,
  DiscordEvent,
} from "../../../event-distribution";
import {
  findManyRequestedGroups,
  GroupWithMemberRelationList,
} from "../common";

@Command({
  event: DiscordEvent.MESSAGE,
  trigger: "!group",
  subTrigger: "search",
  channelNames: ["bot-commands", "permanent-testing"],
  description: "This handler is to search all groups or the specified group",
})
class SearchGroup implements CommandHandler<DiscordEvent.MESSAGE> {
  async handle(message: Message): Promise<void> {
    const words = message.content.split(" ").slice(2);
    const requestedGroupName = words[0];

    const groupsPerPage = 4;
    const pages: Array<EmbedBuilder> = [];
    const byMemberCount = (
      a: GroupWithMemberRelationList,
      b: GroupWithMemberRelationList
    ) =>
      b.userGroupMembersGroupMembers.length -
      a.userGroupMembersGroupMembers.length;

    const copy = (await findManyRequestedGroups(requestedGroupName)).sort(
      byMemberCount
    );

    if (copy.length === 0) {
      await message.reply("No matching groups were found.");
      return;
    }

    const pageAmount = Math.ceil(copy.length / groupsPerPage);

    const yesBotAvatarUrl = message.client.user?.avatarURL({
      size: 256,
      extension: "png",
    });

    for (let i = 0; i < pageAmount; i++) {
      const embed = new EmbedBuilder().setAuthor({
        name: "YesBot",
        iconURL: yesBotAvatarUrl ?? "https://example.com/invalid.png",
      });
      const resultsSentence =
        requestedGroupName == undefined
          ? "Results for all groups"
          : `Results for group ${requestedGroupName}`;
      embed.setDescription(
        `${resultsSentence} (Page ${i + 1} / ${pageAmount})`
      );

      const chunk = copy.splice(0, groupsPerPage);

      const totalFields = chunk.flatMap((group) => [
        { name: "Group Name:", value: group.name, inline: true },
        {
          name: "Number of Members:",
          value: group.userGroupMembersGroupMembers.length.toString(),
          inline: true,
        },
        { name: "Description:", value: group.description || "-" },
        { name: "\u200B", value: "\u200B" },
      ]);

      embed.setFields(totalFields);

      pages.push(embed);
    }

    const flip = async (
      page: number,
      shownPageMessage: Message,
      reaction: MessageReaction
    ) => {
      if (page < 0) page = 0;
      if (page >= pages.length) page = pages.length - 1;

      await shownPageMessage.edit({
        content: message.author.toString(),
        embeds: [pages[page]],
      });
      await reaction.users.remove(message.author.id);
      await setupPaging(page, shownPageMessage);
    };

    const setupPaging = async (currentPage: number, pagedMessage: Message) => {
      const filter = (reaction: MessageReaction, user: User) => {
        return (
          ["⬅️", "➡️"].includes(reaction.emoji.name ?? "") &&
          user.id === message.author.id
        );
      };

      try {
        const reactions = await pagedMessage.awaitReactions({
          filter,
          max: 1,
          time: 60000,
          errors: ["time"],
        });
        const first = reactions.first();
        if (first?.emoji.name === "⬅️") {
          await flip(currentPage - 1, pagedMessage, first);
        }
        if (first?.emoji.name === "➡️") {
          await flip(currentPage + 1, pagedMessage, first);
        }
      } catch (error) {}
    };

    const sentMessagePromise = message.channel.send({ embeds: [pages[0]] });
    if (pages.length > 1) {
      sentMessagePromise
        .then(async (msg) => {
          await msg.react("⬅️");
          await msg.react("➡️");
          return msg;
        })
        .then((msg) => setupPaging(0, msg));
    }
  }
}
