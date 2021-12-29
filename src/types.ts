export interface UserConfiguration {
  /**
   * @default ["**\/*.md"]
   */
  include: string[];

  /**
   * @default ['.encrypt.json']
   */
  exclude: string[];

  /**
   * This is auto generated by extension, please do not edit this property.
   * Other wise, it will cause unknown problem.
   */
  extension: {
    include: string[];
    exclude: string[];
  };
}
