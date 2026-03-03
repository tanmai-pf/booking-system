import {
  IsString,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateLocationDepartmentDto {
  @IsString()
  department: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsString()
  openDays: string;

  @IsOptional()
  @IsString()
  openStart?: string;

  @IsOptional()
  @IsString()
  openEnd?: string;
}
