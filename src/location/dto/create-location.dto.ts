import { IsString, IsOptional, IsUUID, IsBoolean } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsOptional()
  @IsBoolean()
  bookable?: boolean;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
